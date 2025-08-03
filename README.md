# F5-TTS Server

This project provides a web server and a user-friendly interface for the F5-TTS model, allowing you to easily perform text-to-speech synthesis with voice cloning capabilities.

## Features

* **Web Interface:** A simple and intuitive web UI to generate speech without using the command line.
* **Voice Cloning:** Use your own reference audio files to clone voices for TTS.
* **Customization:** Adjust speech speed, NFE steps, cross-fade duration, and more.
* **File Management:** Upload and delete custom reference audio files directly through the UI.
* **REST API:** A comprehensive API for programmatic access to all TTS functions.
* **Real-time Cancellation:** Cancel TTS jobs that are in progress.

## API Endpoints

Here are the available API endpoints with `curl` examples.

### Get Frontend

Serves the main HTML page.

```bash
curl -X GET http://127.0.0.1:8000/
```

### List Reference Audios

Get a list of all available reference audio files.

```bash
curl -X GET http://127.0.0.1:8000/ref-audios/
```

### Upload Reference Audio

Upload a new reference audio file.

```bash
curl -X POST http://127.0.0.1:8000/upload-ref-audio/ \
     -F "file=@/path/to/your/audio.wav"
```

### Upload Reference Text File

Upload a `.txt` file corresponding to a reference audio. The filename of the text file should match the audio file's name (e.g., `my_audio.wav` and `my_audio.txt`).

```bash
curl -X POST http://127.0.0.1:8000/upload-text-file/ \
     -F "file=@/path/to/your/text.txt"
```

### Delete Reference Audio

Delete a custom reference audio file. Note: You can only delete files from the `custom` folder.

```bash
# Replace 'custom/your_audio.wav' with the actual file path
curl -X DELETE http://127.0.0.1:8000/delete-ref-audio/custom/your_audio.wav
```

### Serve Reference Audio

Get a specific reference audio file.

```bash
# Replace 'default/basic_ref_en.wav' with the actual file path
curl -X GET http://127.0.0.1:8000/ref-audios/default/basic_ref_en.wav -o ref_audio.wav
```

### Text-to-Speech Generation

Generate speech from text. This is the main endpoint.

#### Basic Example

This example uses the default settings, including the default English reference voice.

```bash
curl -X POST http://127.0.0.1:8000/tts/ \
     -H "Content-Type: application/json" \
     -d '{
           "gen_text": "Hello, world! This is a test of the F5-TTS server."
         }' \
     --output basic_speech.wav
```

#### Multi-language Example

You can generate speech in different languages by specifying the appropriate reference audio.

**English Example**

```bash
curl -X POST http://127.0.0.1:8000/tts/ \
     -H "Content-Type: application/json" \
     -d '{
           "gen_text": "This is a test in English.",
           "ref_audio": "default/basic_ref_en.wav"
         }' \
     --output english_speech.wav
```

**Chinese Example**

```bash
curl -X POST http://127.0.0.1:8000/tts/ \
     -H "Content-Type: application/json" \
     -d '{
           "gen_text": "这是一个中文测试。",
           "ref_audio": "default/basic_ref_zh.wav"
         }' \
     --output chinese_speech.wav
```

#### Customization Example

This example adjusts the speech speed and quality (NFE steps).

```bash
curl -X POST http://127.0.0.1:8000/tts/ \
     -H "Content-Type: application/json" \
     -d '{
           "gen_text": "I can speak faster or slower depending on the settings.",
           "speed": 1.2,
           "nfe_steps": 40
         }' \
     --output custom_speech.wav
```

#### Voice Cloning Example

To clone a voice, you first need to upload a reference audio file, then use its path in your TTS request.

**Step 1: Upload a reference audio**

```bash
curl -X POST http://127.0.0.1:8000/upload-ref-audio/ \
     -F "file=@/path/to/your/voice_sample.wav"
```

The server will respond with a JSON object containing the filename, for example: `{"filename": "custom/voice_sample.wav"}`.

**Step 2: Use the uploaded audio for TTS**

**Important Note:** For the best voice cloning results, it is highly recommended to provide the transcript of your reference audio. You can do this by uploading a `.txt` file with the same name as your audio file (e.g., `voice_sample.wav` and `voice_sample.txt`). If you don't provide a text file, the server will attempt to automatically transcribe the audio, but the quality may vary.

Use the `filename` from the previous step as the `ref_audio` in your request.

```bash
curl -X POST http://127.0.0.1:8000/tts/ \
     -H "Content-Type: application/json" \
     -d '{
           "gen_text": "This text will be spoken in the voice from the uploaded audio file.",
           "ref_audio": "custom/voice_sample.wav"
         }' \
     --output cloned_speech.wav
```

### Cancel TTS Generation

Cancel a running TTS generation process. You need the `request_id` which is returned in the headers of the `/tts` response.

```bash
# Replace 'your_request_id' with the actual request ID
curl -X POST http://127.0.0.1:8000/cancel-tts/your_request_id
```

### Get TTS Status

Check the status of a TTS generation request.

```bash
# Replace 'your_request_id' with the actual request ID
curl -X GET http://127.0.0.1:8000/tts-status/your_request_id
```
