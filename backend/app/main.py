import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.services.pmpml_service import PMPMLService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("urbaneye.backend")

pmpml_service = PMPMLService()

active_connections: List[WebSocket] = []

async def poll_pmpml_api():
    interval = settings.PMPML_POLL_INTERVAL_SECONDS
    logger.info(f"Started PMPML background poller (target interval: {interval}s)")
    
    # Run immediate first poll
    try:
        await pmpml_service.poll_fleet()
    except Exception as e:
        logger.error(f"Initial PMPML fleet poll failed: {e}")

    while True:
        try:
            await asyncio.sleep(interval)
            await pmpml_service.poll_fleet()
            
            # Broadcast snapshot update to all active WebSocket clients
            fleet_data = pmpml_service.get_current_fleet()
            message = json.dumps({"type": "FLEET_UPDATE", "data": fleet_data})
            
            disconnected = []
            for connection in list(active_connections):
                try:
                    await connection.send_text(message)
                except Exception:
                    disconnected.append(connection)
            
            for conn in disconnected:
                if conn in active_connections:
                    active_connections.remove(conn)

        except asyncio.CancelledError:
            logger.info("PMPML poller background task cancelled")
            break
        except Exception as e:
            logger.error(f"Error in PMPML polling loop: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    polling_task = asyncio.create_task(poll_pmpml_api())
    yield
    polling_task.cancel()
    try:
        await polling_task
    except asyncio.CancelledError:
        pass

app = FastAPI(
    title="URBANEYE Intelligence Platform Backend",
    description="Centralized AI Sensing & Real-Time PMPML Fleet Telemetry API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware configured for development and local frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {
        "status": "online",
        "service": "URBANEYE Intelligence Platform API",
        "health": "/health",
        "docs": "/docs"
    }

@app.get("/health")
async def health_check():
    fleet_data = pmpml_service.get_current_fleet()
    return {
        "status": "healthy",
        "feed_status": fleet_data.get("status"),
        "raw_buses": fleet_data.get("raw_bus_count", 0),
        "valid_buses": fleet_data.get("valid_bus_count", 0),
        "last_update": fleet_data.get("last_update")
    }

@app.get("/api/v1/fleet/live")
async def get_live_fleet():
    """
    Returns current snapshot of all normalized PMPML vehicles.
    Triggers an immediate upstream poll if fleet has never been polled or is uninitialized.
    """
    if pmpml_service.last_successful_poll == 0.0 or not pmpml_service.fleet_state.get("vehicles"):
        await pmpml_service.poll_fleet()
    return pmpml_service.get_current_fleet()

@app.get("/api/v1/fleet/routes")
async def get_routes():
    """
    Returns the 7 priority monitoring corridors in Pune (PMC).
    """
    return await pmpml_service.get_priority_routes()

@app.websocket("/ws/live")
async def websocket_fleet(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    logger.info(f"WebSocket client connected. Total clients: {len(active_connections)}")
    try:
        # If fleet has not been polled yet, poll immediately so client receives real fleet on connection
        if pmpml_service.last_successful_poll == 0.0 or not pmpml_service.fleet_state.get("vehicles"):
            await pmpml_service.poll_fleet()
            
        fleet_data = pmpml_service.get_current_fleet()
        await websocket.send_text(json.dumps({"type": "FLEET_UPDATE", "data": fleet_data}))
        
        while True:
            # Keep-alive receive
            _ = await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in active_connections:
            active_connections.remove(websocket)
        logger.info(f"WebSocket client disconnected. Total clients: {len(active_connections)}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        if websocket in active_connections:
            active_connections.remove(websocket)
