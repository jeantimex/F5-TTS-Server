import subprocess
import logging
import time
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import io

project_root = os.path.dirname(os.path.abspath(os.path.dirname(__file__)))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('tts_server.log'),
        logging.StreamHandler()  # This will show logs in console too
    ]
)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.on_event("startup")
async def startup_event():
    logger.info("F5-TTS Server starting up...")
    logger.info(f"Project root: {project_root}")
    logger.info("Server ready to accept TTS requests")

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
    start_time = time.time()
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S-%f")
    
    # Log the incoming request
    logger.info(f"TTS Request received - ID: {timestamp}")
    logger.info(f"Input text: '{request.gen_text[:100]}{'...' if len(request.gen_text) > 100 else ''}'")
    logger.info(f"Text length: {len(request.gen_text)} characters")
    
    ref_audio_path = os.path.join(project_root, "ref_audios", "basic_ref_en.wav")
    output_filename = f"{timestamp}.wav"
    output_path = os.path.join("output", output_filename)
    
    logger.info(f"Using reference audio: {ref_audio_path}")
    logger.info(f"Output file: {output_path}")

    command = [
        "f5-tts_infer-cli",
        "--model", "F5TTS_v1_Base",
        "--ref_audio", ref_audio_path,
        "--gen_text", request.gen_text,
        "-o", "output",
        "-w", output_filename
    ]

    logger.info(f"Executing TTS command: {' '.join(command)}")
    logger.info("Starting TTS generation...")
    
    try:
        result = subprocess.run(command, check=True, capture_output=True, text=True)
        logger.info("TTS generation completed successfully")
        if result.stdout:
            logger.info(f"TTS stdout: {result.stdout}")
        if result.stderr:
            logger.info(f"TTS stderr: {result.stderr}")
    except subprocess.CalledProcessError as e:
        logger.error(f"TTS generation failed with return code {e.returncode}")
        logger.error(f"TTS stderr: {e.stderr}")
        logger.error(f"TTS stdout: {e.stdout}")
        raise HTTPException(status_code=500, detail=f"Error during TTS generation: {e.stderr}")
    except FileNotFoundError:
        logger.error("f5-tts_infer-cli command not found")
        raise HTTPException(status_code=500, detail="'f5-tts_infer-cli' not found. Ensure the virtual environment is activated and dependencies are installed correctly.")

    if os.path.exists(output_path):
        # Log file details
        file_size = os.path.getsize(output_path)
        generation_time = time.time() - start_time
        
        logger.info(f"Audio file generated successfully")
        logger.info(f"File size: {file_size} bytes ({file_size/1024:.1f} KB)")
        logger.info(f"Generation time: {generation_time:.2f} seconds")
        logger.info(f"Request {timestamp} completed successfully")
        
        def iter_file():
            with open(output_path, "rb") as file_like:
                yield from file_like
        
        return StreamingResponse(iter_file(), media_type="audio/wav")
    else:
        logger.error(f"Generated audio file not found at {output_path}")
        logger.error(f"Request {timestamp} failed - file not found")
        raise HTTPException(status_code=404, detail="Generated audio file not found. The TTS command may have failed silently.")
