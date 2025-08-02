import subprocess
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import io

project_root = os.path.dirname(os.path.abspath(os.path.dirname(__file__)))

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")

class TTSRequest(BaseModel):
    gen_text: str

@app.get("/", response_class=HTMLResponse)
async def read_index():
    try:
        with open("static/index.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Index file not found")
    except UnicodeDecodeError:
        raise HTTPException(status_code=500, detail="Error reading index file")

@app.post("/tts/")
async def text_to_speech(request: TTSRequest):
    ref_audio_path = os.path.join(project_root, "F5-TTS/src/f5_tts/infer/examples/basic/basic_ref_en.wav")
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S-%f")
    output_filename = f"{timestamp}.wav"
    output_path = os.path.join("output", output_filename)

    command = [
        "f5-tts_infer-cli",
        "--model", "F5TTS_v1_Base",
        "--ref_audio", ref_audio_path,
        "--gen_text", request.gen_text,
        "-o", "output",
        "-w", output_filename
    ]

    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Error during TTS generation: {e.stderr}")
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="'f5-tts_infer-cli' not found. Ensure the virtual environment is activated and dependencies are installed correctly.")

    if os.path.exists(output_path):
        def iter_file():
            with open(output_path, "rb") as file_like:
                yield from file_like
        
        return StreamingResponse(iter_file(), media_type="audio/wav")
    else:
        raise HTTPException(status_code=404, detail="Generated audio file not found. The TTS command may have failed silently.")
