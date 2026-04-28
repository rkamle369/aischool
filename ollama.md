docker volume create ollama
docker run -d --name ollama --restart unless-stopped -p 11434:11434 -v ollama:/root/.ollama ollama/ollama
docker exec -it ollama ollama pull qwen2.5:7b-instruct-q4_K_M
docker exec -it ollama ollama run qwen2.5:7b-instruct-q4_K_M


curl http://localhost:11434/api/chat \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen3:4b","messages":[{"role":"user","content":"Say hi in one line"}],"stream":false}'