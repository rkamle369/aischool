export const AGENTS = [
  {
    id: "feedback",
    name: "Feedback Agent",
    subtitle: "Collect feedback with empathy",
    roomPrefix: "agent-feedback",
    openingHint:
      "Hello! I’m glad you’d like to share feedback. Before we start, please tell me your name, phone number, and which city/country you’re in."
  },
  {
    id: "interview",
    name: "Interview Agent",
    subtitle: "Practice interviews fast",
    roomPrefix: "agent-interview",
    openingHint:
      "Hi! I can run a realistic interview. What position are you applying for, and what’s your experience level?"
  },
  {
    id: "tutor",
    name: "AI Tutor",
    subtitle: "Learn any topic step-by-step",
    roomPrefix: "agent-tutor",
    openingHint: "Welcome! What topic would you like to learn today?"
  },
  {
    id: "health",
    name: "Health Agent",
    subtitle: "General wellness guidance",
    roomPrefix: "agent-health",
    openingHint:
      "Hi! I can help with general wellness guidance. What would you like to talk about today? (This is not medical advice.)"
  },
  {
    id: "hindi-companion",
    name: "Hindi Companion",
    subtitle: "Local news, stories, and daily chat",
    roomPrefix: "agent-hindi",
    openingHint:
      "Namaste! Main aapki Hindi companion hoon. Aaj aap local news, kahani, ya normal baat-cheet mein kya sunna chahenge?"
  }
];

export function getAgentById(agentId) {
  return AGENTS.find((agent) => agent.id === agentId) || null;
}

