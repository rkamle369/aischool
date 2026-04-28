const basePrompt = `You are an expert AI Teacher helping students learn software engineering and AI concepts.

Your teaching style:
- Explain step-by-step in simple terms
- Use examples
- Ask questions
- Keep responses short and interactive
- Keep every response concise and voice-friendly
- Keep each response under 80 words unless user explicitly asks for detail
- Prefer 3-6 short bullets for summaries

Flow:
1. Explain
2. Give example
3. Ask question
4. Adapt based on answer

Student level: beginner

Chapter content:
{{chapter_content}}`;

export const buildSystemPrompt = (chapterContent) =>
  basePrompt.replace("{{chapter_content}}", chapterContent);

const buildPromptMessages = (systemPrompt, messages) => [
  { role: "system", content: systemPrompt },
  ...messages.map((msg) => ({
    role: msg.role === "assistant" ? "assistant" : "user",
    content: msg.content
  }))
];

const extractAssistantContent = (value) => {
  const content = typeof value === "string" ? value.trim() : "";
  return content;
};

const callGroq = async ({ systemPrompt, messages }) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is missing in backend/.env");
  }

  const groqBaseUrl = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
  const groqModel = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
  const response = await fetch(`${groqBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: groqModel,
      temperature: 0.7,
      max_tokens: 220,
      messages: buildPromptMessages(systemPrompt, messages)
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Groq request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const content = extractAssistantContent(data?.choices?.[0]?.message?.content);
  return content || "I did not catch that fully. Please repeat your question in one sentence.";
};

const callOpenAI = async ({ systemPrompt, messages }) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing in backend/.env");
  }

  const openaiBaseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const openaiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const response = await fetch(`${openaiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: openaiModel,
      temperature: 0.4,
      max_tokens: 140,
      messages: buildPromptMessages(systemPrompt, messages)
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const content = extractAssistantContent(data?.choices?.[0]?.message?.content);
  return content || "I did not catch that fully. Please repeat your question in one sentence.";
};

const callOllama = async ({ systemPrompt, messages }) => {
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const configuredModel = process.env.OLLAMA_MODEL || "qwen3:1.7b";
  const ollamaNumPredict = Number(process.env.OLLAMA_NUM_PREDICT || 120);
  const ollamaNumCtx = Number(process.env.OLLAMA_NUM_CTX || 2048);
  const ollamaTemperature = Number(process.env.OLLAMA_TEMPERATURE || 0.5);
  const candidateModels = [
    configuredModel,
    "qwen3:1.7b"
  ].filter((value, index, arr) => arr.indexOf(value) === index);

  let lastError = null;
  for (const model of candidateModels) {
    const response = await fetch(`${ollamaBaseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        messages: buildPromptMessages(systemPrompt, messages),
        options: {
          temperature: ollamaTemperature,
          num_predict: ollamaNumPredict,
          num_ctx: ollamaNumCtx
        }
      })
    });

    if (response.ok) {
      const data = await response.json();
      const content = extractAssistantContent(data?.message?.content);
      if (content) {
        return content;
      }
      lastError = `Ollama model '${model}' returned an empty response`;
      continue;
    }

    const text = await response.text();
    lastError = `Ollama request failed for model '${model}': ${response.status} ${text}`;
    if (response.status !== 404) {
      throw new Error(lastError);
    }
  }

  if (lastError?.includes("returned an empty response")) {
    return "I did not catch that fully. Please repeat your question in one sentence.";
  }

  throw new Error(`${lastError}. Ensure model is available: ollama pull qwen3:1.7b`);
};

export const generateChatReply = async ({ chapterContent, messages }) => {
  const systemPrompt = buildSystemPrompt(chapterContent);
  const provider = (process.env.AI_PROVIDER || "openai").toLowerCase();
  if (provider === "openai") {
    return callOpenAI({ systemPrompt, messages });
  }
  if (provider === "groq") {
    return callGroq({ systemPrompt, messages });
  }
  return callOllama({ systemPrompt, messages });
};
