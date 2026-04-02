# Smart Geo Portal 🌍🤖

![Smart Geo Portal Preview](frontend/public/map.png)

**Smart Geo Portal** is a high-performance Geospatial platform that integrates vector map tiles, interactive dashboards, and AI-powered spatial analytics. It leverages Large Language Models (LLMs) to allow users to interact with their spatial data using natural language.

---

## ✨ Key Features

-   🗺️ **Dynamic Vector Tiles**: High-performance map rendering served by [Martin](https://github.com/maplibre/martin) directly from PostGIS.
-   💬 **AI Spatial Assistant**: Chat with your data! Ask questions like *"Show me the latest 5 mining conflicts in a table"* using a LangChain SQL Agent with built-in memory.
-   📁 **Seamless Data Ingestion**: Upload GeoJSON or Shapefiles (.zip) which are automatically converted to PostGIS tables and indexed with embeddings.
-   🎨 **Live Style Editing**: Integrated with [Maputnik](https://github.com/maplibre/maputnik). Changes to your map styles are synced in real-time to the viewer via SSE (Server-Sent Events).
-   🔒 **Secure & Managed**: Built-in JWT authentication and a dedicated dashboard for data management.

---

### Component Breakdown
| Layer | Component | Role |
| :--- | :--- | :--- |
| **Client** | **Frontend** | Interactive map viewer and dashboard built with MapLibre GL JS and React. |
| **Logic** | **FastAPI** | Orchestrates authentication, AI chat processing, and live map style synchronization. |
| | **Martin** | High-performance PostGIS vector tile server for smooth map rendering. |
| | **Maputnik** | Integrated visual editor for customizing map styles on the fly. |
| **Data/AI**| **PostGIS** | Geospatial database that stores both your raw data and vector embeddings. |
| | **Ollama** | Powers the AI assistant with Llama 3.2 and generates spatial embeddings. |

---

## 🚀 Getting Started

### Prerequisites

-   **Docker & Docker Compose** (Recommended for easiest setup)
-   **PostgreSQL 15+ with PostGIS & pgvector** (If running locally)
-   **Ollama** installed and running on the host machine.

### 🛠️ Step-by-Step Installation

1.  **Clone & Navigate**:
    ```bash
    git clone https://github.com/habib-roy/smart-geo-portal
    cd smart-geo-portal
    ```

2.  **Ensure Ollama Models are Ready**:
    The platform requires `llama3.2` for logic and `mxbai-embed-large` for spatial embeddings.
    ```bash
    ollama pull llama3.2
    ollama pull mxbai-embed-large
    ```

3.  **Launch with Docker Compose**:
    ```bash
    ```bash
    docker-compose up -d --build
    ```
    *Note: The backend will automatically create the necessary database schema and an admin user on the first run.*

---

## 🔑 Environment Variables

The platform uses a unified `.env` file at the root directory to manage its configuration. Before running the application, ensure you have set up the variables correctly.

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| **`DATABASE_URL`** | Connection string for PostGIS | `postgresql://roy:123@host.docker.internal:5432/geospatial_db` |
| **`JWT_SECRET`** | Secret key for JWT authentication | `supersecretgeoaikey2026` |
| **`OLLAMA_HOST`** | URL of the Ollama server | `http://host.docker.internal:11434` |
| **`VITE_API_URL`** | Backend API URL for the Frontend | `http://localhost:8000` |
| **`VITE_MARTIN_URL`** | Martin Tileserver URL for the Frontend | `http://localhost:3333` |

> [!TIP]
> Use the provided `.env.example` as a template: `cp .env.example .env`.

---

## 🔑 Default Credentials

Saat pertama kali dijalankan, sistem akan otomatis membuat satu akun admin default:

| Field | Value |
| :--- | :--- |
| **Username** | `admin` |
| **Password** | `admin` |
| **Role** | `admin` |

---

## 🌐 Integrated Services

| Service | Description | Access URL |
| :--- | :--- | :--- |
| **Smart Geo Portal Dashboard** | Main UI (Login, Data Upload, Map Viewer) | [http://localhost:8080](http://localhost:8080) |
| **FastAPI Backend** | API Documentation (Swagger UI) | [http://localhost:8000/docs](http://localhost:8000/docs) |
| **Martin Tileserver** | High-performance Vector Tile Server | [http://localhost:3333](http://localhost:3333) |
| **Maputnik Editor** | Visual Style Editor for MapLibre | [http://localhost:8888](http://localhost:8888) |

---

## 🛠️ Tech Stack

-   **Backend**: [FastAPI](https://fastapi.tiangolo.com/), [LangChain](https://www.langchain.com/), [SQLAlchemy](https://www.sqlalchemy.org/), [PostGIS](https://postgis.net/).
-   **Frontend**: [React (Vite)](https://vitejs.dev/), [Tailwind CSS](https://tailwindcss.com/), [MapLibre GL JS](https://maplibre.org/).
-   **AI/ML**: [Ollama](https://ollama.com/), [mxbai-embed-large](https://www.mixedbread.ai/docs/embeddings/mxbai-embed-large-v1), [pgvector](https://github.com/pgvector/pgvector).
-   **Infrastucture**: Docker, [Martin](https://github.com/maplibre/martin).

---

## 💡 Usage Tips

-   **Adding New Data**: Go to the Dashboard, upload your GeoJSON. Wait for the progress bar to finish (embeddings generation). Once done, it will appear in the Map Viewer sidebar.
-   **Custom Styling**: Open Maputnik at port 8888. Any colors or layers you change there will be saved to `backend/style/default.json` and immediately reflected in your Map Viewer without a refresh.
-   **AI Inquiries**: Use the chat sidebar to ask about your data. Example: *"Berapa banyak titik konflik yang ada di database?"* - The agent will query the SQL database directly.

---

## 📝 License

Distributed under the MIT License. See `LICENSE` for more information.
