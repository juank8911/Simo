from fastapi import FastAPI, Request
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
import socketio
import asyncio

app = FastAPI()
templates = Jinja2Templates(directory="templates")

# Lista global para almacenar los datos recibidos
received_data = []

# Cliente Socket.IO
sio = socketio.AsyncClient()

# Conexión al servidor Node.js (ajusta el puerto si es necesario)
NODE_WS_URL = "http://localhost:3001"

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(connect_to_socket())

async def connect_to_socket():
    await sio.connect(NODE_WS_URL)
    print("Conectado al WebSocket de Node.js")

@sio.on("spot-arb")
async def on_spot_arb(data):
    print("Recibido:", data)
    received_data.append(data)
    if len(received_data) > 100:
        received_data.pop(0)

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request, "data": received_data[::-1]})