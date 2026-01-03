#!/bin/bash
# Kill process on port 5173 (Unix/Linux/Mac)
PORT=5173

# Find and kill process on port
if command -v lsof &> /dev/null; then
    PID=$(lsof -ti:$PORT)
    if [ ! -z "$PID" ]; then
        echo "Killing process $PID on port $PORT"
        kill -9 $PID
        echo "Port $PORT is now free"
    else
        echo "Port $PORT is already free"
    fi
elif command -v fuser &> /dev/null; then
    fuser -k $PORT/tcp 2>/dev/null && echo "Port $PORT is now free" || echo "Port $PORT is already free"
else
    echo "Neither lsof nor fuser found. Please install one of them."
    exit 1
fi

