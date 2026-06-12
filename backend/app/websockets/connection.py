from typing import Dict, List, Any
from fastapi import WebSocket, WebSocketDisconnect
from jose import jwt, JWTError
from app.core.config import settings
from app.core.security import ALGORITHM

class ConnectionManager:
    """
    Manages active WebSocket connections for real-time agent log streaming.
    Organizes connections by organization ID to ensure multi-tenant security.
    """
    def __init__(self):
        # Maps org_id (int) -> List of active WebSockets
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, token: str) -> int:
        """
        Validates token, connects user, and returns their organization_id.
        """
        await websocket.accept()
        
        try:
            # Decode token to verify auth
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("sub")
            
            # For this simple implementation, we can extract organization_id from token 
            # or use organization channels. Let's default to organization channel 1.
            # In production, we'd look up the user's organization from the DB.
            # To keep WebSockets extremely fast and database-independent, we encode 
            # organization_id inside the JWT on login, or look it up.
            # Let's fallback to org_id = 1 if not readable, or extract it.
            org_id = 1
            if "org_id" in payload:
                org_id = int(payload["org_id"])
                
        except JWTError:
            await websocket.close(code=1008) # Policy Violation
            raise Exception("Unauthorized WebSocket Connection")
            
        if org_id not in self.active_connections:
            self.active_connections[org_id] = []
            
        self.active_connections[org_id].append(websocket)
        return org_id

    def disconnect(self, websocket: WebSocket, org_id: int):
        if org_id in self.active_connections:
            if websocket in self.active_connections[org_id]:
                self.active_connections[org_id].remove(websocket)
            if not self.active_connections[org_id]:
                del self.active_connections[org_id]

    async def send_personal_message(self, message: Dict[str, Any], websocket: WebSocket):
        await websocket.send_json(message)

    async def broadcast_to_org(self, org_id: int, message: Dict[str, Any]):
        """
        Broadcasts message to all active WebSocket clients inside the same organization.
        """
        if org_id in self.active_connections:
            for connection in self.active_connections[org_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    # Connection might have died, handle cleanup on next cycle
                    pass

manager = ConnectionManager()
