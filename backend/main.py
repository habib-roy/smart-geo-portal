from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, BackgroundTasks, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import models, database, auth
from datetime import timedelta
import tempfile
import os
from dotenv import load_dotenv

# Cari .env di root
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

import re
import docker
import json
import asyncio
from datetime import datetime
from watchdog.observers.polling import PollingObserver as Observer
from watchdog.events import FileSystemEventHandler
from fastapi.responses import StreamingResponse
import geopandas as gpd
from geoalchemy2 import Geometry, WKTElement

# AI Libraries
from langchain_core.embeddings import Embeddings
from langchain_ollama import OllamaEmbeddings, ChatOllama
from langchain_community.utilities import SQLDatabase
from langchain_community.agent_toolkits import create_sql_agent
try:
    from langchain_classic.memory.buffer import ConversationBufferMemory
except ImportError:
    try:
        from langchain.memory import ConversationBufferMemory
    except ImportError:
        from langchain_community.memory import ConversationBufferMemory

from langchain_core.messages import HumanMessage, AIMessage

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Smart Geo Portal Platform API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount styles directory
if not os.path.exists("style"):
    os.makedirs("style")
app.mount("/styles", StaticFiles(directory="style"), name="styles")

# --- GLOBAL AI CACHE ---
# Cache to avoid recompiling database reflection on every request
global_cache = {
    "sql_db": None,
    "llm": None
}

@app.on_event("startup")
async def startup_event():
    print(f"[{datetime.now()}] Initializing AI Components...")
    try:
        db_uri = os.getenv("DATABASE_URL", "postgresql://roy:123@host.docker.internal:5432/geospatial_db")
        # Optimization: only reflect tables when needed, or at least cache the engine
        global_cache["sql_db"] = SQLDatabase.from_uri(db_uri)
        
        ollama_host = os.getenv("OLLAMA_HOST", "http://host.docker.internal:11434")
        global_cache["llm"] = ChatOllama(
            model="llama3.2", 
            base_url=ollama_host,
            temperature=0,
            streaming=True
        )
        print(f"[{datetime.now()}] AI Components Initialized Successfully.")
    except Exception as e:
        print(f"[{datetime.now()}] Failed to initialize AI Components during startup: {e}")


# --- LIVE SYNC STYLE ---
style_event_queue = asyncio.Queue()

class StyleWatcher(FileSystemEventHandler):
    def on_modified(self, event):
        if event.src_path.endswith("default.json"):
            print(f"Style change detected: {event.src_path}")
            # Use a global loop or similar to push to queue from thread
            # Since watchdog runs in a thread, we put into the queue
            asyncio.run_coroutine_threadsafe(style_event_queue.put("reload"), main_loop)

def start_style_watcher():
    observer = Observer()
    handler = StyleWatcher()
    observer.schedule(handler, path="style", recursive=False)
    observer.start()
    print("Style watcher started on 'style' directory")

main_loop = None

@app.on_event("startup")
async def startup_event():
    global main_loop
    main_loop = asyncio.get_running_loop()
    
    # Initialize tables
    models.Base.metadata.create_all(bind=database.engine)
    
    # Start style watcher in background
    start_style_watcher()
    
    # Automatisasi pembuatan user admin jika belum ada
    db = database.SessionLocal()
    try:
        admin_user = db.query(models.User).filter(models.User.username == "admin").first()
        if not admin_user:
            from auth import get_password_hash
            new_admin = models.User(
                username="admin",
                password_hash=get_password_hash("admin"),
                role="admin"
            )
            db.add(new_admin)
            db.commit()
            print("Admin user created automatically: admin / admin")
    except Exception as e:
        print(f"Error creating admin user: {e}")
    finally:
        db.close()

@app.get("/", tags=["General"])
def read_root():
    return {"status": "Smart Geo Portal Backend Online", "version": "1.3.0"}

# --- BACKGROUND TASKS ---

async def generate_embeddings_task(data_id: int):
    db = database.SessionLocal()
    try:
        data_info = db.query(models.GeospatialData).filter(models.GeospatialData.id == data_id).first()
        if not data_info: return
        
        data_info.status = "processing"
        data_info.progress = 0
        db.commit()

        # Initialize Embeddings
        embeddings = OllamaEmbeddings(
            model="mxbai-embed-large",
            base_url=os.getenv("OLLAMA_HOST", "http://host.docker.internal:11434")
        )

        table_name = data_info.table_name
        
        # Add vector column if not exists (dim 1024 for mxbai-embed-large)
        with database.engine.connect() as conn:
            conn.execute(text(f'ALTER TABLE "{table_name}" ADD COLUMN IF NOT EXISTS embedding vector(1024)'))
            conn.commit()

        # Fetch all records
        df = gpd.read_postgis(f'SELECT * FROM "{table_name}"', database.engine, geom_col='geometry')
        total = len(df)

        for i, row in df.iterrows():
            # Combine all attributes into one string
            attr_text = ". ".join([f"{col}: {val}" for col, val in row.items() if col not in ['geometry', 'embedding', 'id']])
            
            # Generate embedding
            vector = embeddings.embed_query(attr_text)
            
            # Update database
            # We use a raw SQL for pgvector insertion
            with database.engine.connect() as conn:
                conn.execute(
                    text(f'UPDATE "{table_name}" SET embedding = :vec WHERE ctid = (SELECT ctid FROM "{table_name}" OFFSET :offset LIMIT 1)'),
                    {"vec": str(vector), "offset": i}
                )
                conn.commit()

            # Update progress
            if i % 5 == 0 or i == total - 1:
                data_info.progress = int(((i + 1) / total) * 100)
                db.commit()

        data_info.status = "completed"
        data_info.progress = 100
        db.commit()
    except Exception as e:
        print(f"Error in background task: {e}")
        db.execute(text("UPDATE geospatial_data SET status = 'failed' WHERE id = :id"), {"id": data_id})
        db.commit()
    finally:
        # Try to restart Martin to discover the new table
        try:
            client = docker.from_env()
            container = client.containers.get("smart_geo_martin")
            container.restart()
            print("Successfully restarted Martin Tile Server")
        except Exception as de:
            print(f"Failed to restart Martin automatically: {de}")
        db.close()

# --- MODELS FOR API ---

class UserCreate(BaseModel):
    username: str
    password: str

# --- AUTH ENDPOINTS ---

@app.post("/auth/register", tags=["Authentication"])
def register(user_in: UserCreate, db: Session = Depends(database.get_db)):
    db_user = db.query(models.User).filter(models.User.username == user_in.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed_password = auth.get_password_hash(user_in.password)
    new_user = models.User(username=user_in.username, password_hash=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"status": "success", "user": new_user.username}

@app.post("/auth/login", tags=["Authentication"])
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = auth.create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

# --- USER MANAGEMENT ---

@app.get("/users/me", tags=["User Management"])
def get_me(current_user: models.User = Depends(auth.get_current_user)):
    return {"username": current_user.username, "role": current_user.role}

# --- DATA MANAGEMENT ---

@app.post("/data/upload", tags=["Data Management"])
async def upload_data(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...), 
    description: str = "",
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".json", ".geojson", ".zip"]:
        raise HTTPException(status_code=400, detail="Unsupported file format")

    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        gdf = gpd.read_file(tmp_path)
        # Sanitasi nama tabel: hanya huruf, angka, dan underscore
        base_name = os.path.splitext(file.filename)[0].lower()
        sanitized_name = re.sub(r'[^a-zA-Z0-9]', '_', base_name)
        table_name = f"geo_{sanitized_name}"
        
        gdf.to_postgis(table_name, database.engine, if_exists='replace', index=False)
        
        new_data = db.query(models.GeospatialData).filter(models.GeospatialData.table_name == table_name).first()
        if new_data:
            new_data.status = "pending"
            new_data.progress = 0
            new_data.description = description
        else:
            new_data = models.GeospatialData(
                filename=file.filename,
                table_name=table_name,
                description=description,
                owner_id=current_user.id,
                status="pending"
            )
            db.add(new_data)
        
        db.commit()
        db.refresh(new_data)
        
        # Trigger background task for embedding
        background_tasks.add_task(generate_embeddings_task, new_data.id)
        
        return {"status": "success", "table": table_name, "data_id": new_data.id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

@app.get("/data/list", tags=["Data Management"])
def list_data(db: Session = Depends(database.get_db)):
    return db.query(models.GeospatialData).all()

@app.get("/map/style/events")
async def style_events():
    async def event_generator():
        while True:
            # Wait for a change event
            message = await style_event_queue.get()
            if message == "reload":
                yield f"data: {message}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/map/style.json")
async def get_map_style(request: Request):
    try:
        style_path = os.path.join("style", "default.json")
        if not os.path.exists(style_path):
            return {"error": "Style file not found"}
            
        with open(style_path, "r") as f:
            style_data = json.load(f)
            
        # Dinamis: ganti localhost dengan host pengakses agar Martin tetap reachable
        host = request.url.hostname
        style_str = json.dumps(style_data)
        style_str = style_str.replace("localhost:3333", f"{host}:3333")
        
        return json.loads(style_str)
    except Exception as e:
        return {"error": str(e)}

@app.delete("/data/delete/{data_id}", tags=["Data Management"])
def delete_data(data_id: int, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    data = db.query(models.GeospatialData).filter(models.GeospatialData.id == data_id).first()
    if not data:
        raise HTTPException(status_code=404, detail="Data tidak ditemukan")
    
    # Cek kepemilikan (kecuali admin)
    if current_user.role != 'admin' and data.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Anda tidak memiliki izin untuk menghapus data ini")
    
    try:
        # Drop tabel PostGIS
        with database.engine.connect() as conn:
            conn.execute(text(f'DROP TABLE IF EXISTS "{data.table_name}"'))
            conn.commit()
        
        # Hapus metadata
        db.delete(data)
        db.commit()
        return {"status": "success", "message": f"Data {data.filename} berhasil dihapus"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# --- AI CHAT WITH SMART ROUTING, MEMORY & STREAMING ---
# In-memory storage for chat histories (per user/session)
chat_histories = {} 

def is_spatial_query(text: str) -> bool:
    """Detection of spatial or database-related keywords for routing."""
    keywords = [
        "data", "layer", "tabel", "tampilkan", "cari", "hitung", "berapa", 
        "spatial", "peta", "geojson", "shapefile", "jarak", "area", "lokasi",
        "titik", "polygon", "conflict", "mine", "mining", "database", "sql"
    ]
    text_lower = text.lower()
    return any(kw in text_lower for kw in keywords)

@app.post("/chat", tags=["AI"])
async def chat(
    message: str, 
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    print(f"[{datetime.now()}] Chat Request: {message[:50]}...")
    try:
        # Load global cache
        if global_cache["sql_db"] is None or global_cache["llm"] is None:
            # Re-init if cache lost
            db_uri = os.getenv("DATABASE_URL", "postgresql://roy:123@host.docker.internal:5432/geospatial_db")
            global_cache["sql_db"] = SQLDatabase.from_uri(db_uri)
            global_cache["llm"] = ChatOllama(
                model="llama3.2", 
                base_url=os.getenv("OLLAMA_HOST", "http://host.docker.internal:11434"),
                temperature=0,
                streaming=True
            )
            
        sql_db = global_cache["sql_db"]
        llm = global_cache["llm"]
        
        # Session Memory
        session_id = str(current_user.id)
        if session_id not in chat_histories:
            chat_histories[session_id] = ConversationBufferMemory(
                memory_key="chat_history", 
                return_messages=True
            )
        
        memory = chat_histories[session_id]
        
        # --- ROUTING LOGIC ---
        spatial_context = is_spatial_query(message)
        
        if not spatial_context:
            print(f"[{datetime.now()}] Routing to FAST path (General Chat)")
            
            async def fast_response_streamer():
                try:
                    # Get history for context
                    history = memory.load_memory_variables({}).get("chat_history", [])
                    prompt_messages = history + [HumanMessage(content=message)]
                    
                    full_answer = ""
                    # Direct token streaming from Ollama (Very Fast)
                    async for chunk in llm.astream(prompt_messages):
                        token = chunk.content
                        full_answer += token
                        yield token
                        await asyncio.sleep(0.01)
                    
                    # Save into memory
                    memory.save_context({"input": message}, {"output": full_answer})
                    print(f"[{datetime.now()}] Fast Path Finished. Length: {len(full_answer)}")
                except Exception as e:
                    print(f"Fast path error: {e}")
                    yield f"Error: {str(e)}"

            return StreamingResponse(fast_response_streamer(), media_type="text/plain")

        else:
            print(f"[{datetime.now()}] Routing to POWER path (Spatial Agent)")
            # Agent for spatial data
            agent_executor = create_sql_agent(
                llm, 
                db=sql_db, 
                verbose=True,
                agent_executor_kwargs={"memory": memory}
            )
            
            async def power_response_streamer():
                start_time = datetime.now()
                try:
                    # Enrich prompt for agent
                    full_input = f"{message}. Jawab dalam Bahasa Indonesia yang ramah. Jika ada data tabel, gunakan Markdown."
                    
                    # Agent invoke waits for Ollama thought chain
                    result = await asyncio.to_thread(agent_executor.invoke, {"input": full_input})
                    answer = result.get("output", "")
                    
                    duration = (datetime.now() - start_time).total_seconds()
                    print(f"[{datetime.now()}] Power Path Finished in {duration:.2f}s. Length: {len(answer)}")

                    if not answer:
                        yield "Maaf, sistem tidak menemukan data yang sesuai."
                        return

                    # Simulated stream for the final answer
                    for i in range(0, len(answer), 8):
                        yield answer[i:i+8]
                        await asyncio.sleep(0.01)
                        
                except Exception as inner_e:
                    print(f"Power path inner error: {inner_e}")
                    yield f"Error Spatial Agent: {str(inner_e)}"

            return StreamingResponse(power_response_streamer(), media_type="text/plain")

    except Exception as e:
        print(f"Chat execution outer error: {e}")
        return StreamingResponse(iter([f"Error Routing: {str(e)}"]), media_type="text/plain")

    except Exception as e:
        print(f"Chat Error: {e}")
        return StreamingResponse(iter([f"Error: {str(e)}"]), media_type="text/plain")
