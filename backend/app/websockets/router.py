from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.websockets.connection import manager

router = APIRouter()

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...)
):
    org_id = None
    try:
        org_id = await manager.connect(websocket, token)
        
        # Keep connection open and respond to client messages (if any)
        while True:
            # Simple ping-pong or text reader
            data = await websocket.receive_text()
            # Respond to ping
            if data == "ping":
                await websocket.send_text("pong")
                
    except WebSocketDisconnect:
        if org_id is not None:
            manager.disconnect(websocket, org_id)
    except Exception:
        if org_id is not None:
            manager.disconnect(websocket, org_id)
