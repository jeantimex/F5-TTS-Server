#!/bin/bash

# The git repository for F5-TTS
F5_TTS_GIT_URL="https://github.com/SWivid/F5-TTS.git" # Placeholder URL

# Check if F5-TTS directory exists
if [ ! -d "F5-TTS" ]; then
    echo "F5-TTS directory not found. Cloning from git..."
    git clone $F5_TTS_GIT_URL
else
    echo "F5-TTS directory found."
fi

# If F5-TTS directory is found, install it
if [ -d "F5-TTS" ]; then
    echo "Installing F5-TTS..."
    (cd F5-TTS && pip install -e .)
fi

# Install python packages
if [ -f "requirements.txt" ]; then
    echo "Installing python packages..."
    pip install -r requirements.txt
else
    echo "requirements.txt not found."
fi

# Start the server
echo "Starting server..."
uvicorn api.main:app --host 0.0.0.0 --port 8000
