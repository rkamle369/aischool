function makeQuestion(id, question, options, correct, explanation) {
  return { id, question, options, correct, explanation };
}

function splitToLevels(questions) {
  return [
    { id: "level-1", name: "Level 1", questions: questions.slice(0, 10) },
    { id: "level-2", name: "Level 2", questions: questions.slice(10, 20) }
  ];
}

const DEVOPS_QUESTIONS = [
  makeQuestion("dev-1", "What does CI stand for in DevOps?", ["Continuous Integration", "Code Inspection", "Cloud Instance", "Container Interface"], 0, "CI means Continuous Integration: frequently merging code to detect issues early."),
  makeQuestion("dev-2", "Which tool is commonly used for containerization?", ["Jenkins", "Docker", "Ansible", "Terraform"], 1, "Docker packages apps and dependencies into portable containers."),
  makeQuestion("dev-3", "Infrastructure as Code helps teams by:", ["Avoiding version control", "Manual server setup", "Automating infrastructure provisioning", "Removing testing"], 2, "IaC makes infrastructure repeatable, auditable, and automated."),
  makeQuestion("dev-4", "What is the primary use of Kubernetes?", ["Monitoring logs only", "Orchestrating containers", "Writing backend APIs", "Designing UI"], 1, "Kubernetes manages deployment, scaling, and lifecycle of containers."),
  makeQuestion("dev-5", "Which file defines Docker image build steps?", ["docker-compose.yml", "Dockerfile", ".dockerignore", "package.json"], 1, "Dockerfile contains instructions to build the container image."),
  makeQuestion("dev-6", "Blue-green deployment reduces:", ["Code readability", "Deployment risk and downtime", "Cloud costs to zero", "Need for testing"], 1, "Blue-green keeps two environments to safely switch traffic."),
  makeQuestion("dev-7", "Which metric is part of DORA?", ["Time to first commit", "Deployment frequency", "Number of developers", "Feature count"], 1, "Deployment frequency is a core DORA engineering performance metric."),
  makeQuestion("dev-8", "A pipeline stage after build is often:", ["Syntax coloring", "Deployment or test", "UI prototyping", "License check only"], 1, "Pipelines usually run tests and deploy after successful builds."),
  makeQuestion("dev-9", "What is Ansible mainly used for?", ["DB schema design", "Configuration management", "Browser rendering", "Mobile testing"], 1, "Ansible automates configuration and operational tasks."),
  makeQuestion("dev-10", "A rollback strategy is important because:", ["It slows releases", "Failures never happen", "It helps recover quickly from bad releases", "It replaces testing"], 2, "Rollback enables quick restoration when issues are detected."),
  makeQuestion("dev-11", "GitOps means deployments are driven by:", ["Chat messages", "Code repository state", "Manual SSH only", "Email approvals"], 1, "GitOps treats Git as the source of truth for deployments."),
  makeQuestion("dev-12", "Terraform is best known for:", ["Frontend routing", "Provisioning cloud infrastructure", "Unit testing", "Audio streaming"], 1, "Terraform manages cloud resources declaratively."),
  makeQuestion("dev-13", "In monitoring, an alert should be:", ["Noisy and frequent", "Actionable and meaningful", "Based on random values", "Hidden from team"], 1, "Good alerts are actionable to reduce alert fatigue."),
  makeQuestion("dev-14", "What is canary deployment?", ["Deploying to no one", "Deploying to a small subset first", "Deploying only at night", "Deploying without metrics"], 1, "Canary rollouts limit blast radius by gradual exposure."),
  makeQuestion("dev-15", "Log aggregation is useful for:", ["Storing CSS", "Centralized troubleshooting", "Image compression", "Package management"], 1, "Centralized logs speed incident investigation."),
  makeQuestion("dev-16", "SRE error budgets relate to:", ["Maximum lines of code", "Allowed reliability risk", "Test coverage only", "Network bandwidth"], 1, "Error budgets balance feature velocity with reliability."),
  makeQuestion("dev-17", "A key benefit of automated tests in CI is:", ["Slower feedback", "Earlier defect detection", "No need for code review", "No need for docs"], 1, "Automated tests provide fast quality feedback."),
  makeQuestion("dev-18", "What does immutable infrastructure imply?", ["Servers are patched manually", "Infra is replaced, not changed in-place", "One server forever", "No backups"], 1, "Immutable infra reduces drift and surprise behavior."),
  makeQuestion("dev-19", "Secrets should be stored in:", ["Source code", "Environment/secret manager", "Public wiki", "Commit messages"], 1, "Use secure secret stores instead of hardcoding."),
  makeQuestion("dev-20", "Post-incident reviews should focus on:", ["Blame", "Learning and prevention", "Silence", "Ignoring metrics"], 1, "Blameless reviews improve systems and team processes.")
];

const AI_QUESTIONS = [
  makeQuestion("ai-1", "What is supervised learning?", ["Learning with labeled data", "Learning without data", "Only reinforcement", "Only clustering"], 0, "Supervised learning maps labeled inputs to outputs."),
  makeQuestion("ai-2", "Which model is used for text generation?", ["CNN", "Transformer", "K-means", "Random Forest only"], 1, "Transformers are widely used for modern language models."),
  makeQuestion("ai-3", "Overfitting means the model:", ["Generalizes better", "Memorizes training data and performs poorly on new data", "Needs less data", "Runs faster"], 1, "Overfit models fail to generalize to unseen examples."),
  makeQuestion("ai-4", "A confusion matrix is used for:", ["Regression only", "Classification evaluation", "Data cleaning", "Feature scaling"], 1, "It summarizes classification outcomes like TP, FP, FN, TN."),
  makeQuestion("ai-5", "What is prompt engineering?", ["Designing GPUs", "Crafting effective model instructions", "Building datasets only", "Deploying Kubernetes"], 1, "Good prompts improve LLM response quality."),
  makeQuestion("ai-6", "RAG combines LLMs with:", ["Image filters", "External retrieval of relevant knowledge", "Only caching", "Audio codecs"], 1, "RAG grounds answers with retrieved context."),
  makeQuestion("ai-7", "Token limit affects:", ["Battery only", "How much input/output text a model can handle", "Font size", "Internet speed"], 1, "Context windows limit how much text models process."),
  makeQuestion("ai-8", "Precision and recall are:", ["Database terms", "Model evaluation metrics", "CSS properties", "Cloud billing fields"], 1, "They evaluate different aspects of classification quality."),
  makeQuestion("ai-9", "Fine-tuning is:", ["Changing monitor settings", "Adapting a pretrained model on task-specific data", "Compressing images", "Deleting parameters"], 1, "Fine-tuning customizes model behavior for tasks."),
  makeQuestion("ai-10", "Hallucination in LLMs means:", ["Audio noise", "Confident but incorrect outputs", "GPU overheating", "Network timeout"], 1, "Hallucinations are plausible-looking incorrect responses."),
  makeQuestion("ai-11", "Embeddings represent text as:", ["Raw pixels", "Numeric vectors in semantic space", "Audio waveforms only", "Database rows"], 1, "Embeddings capture semantic similarity mathematically."),
  makeQuestion("ai-12", "Temperature controls:", ["Hardware temperature", "Randomness/creativity in outputs", "Token cost directly", "Latency only"], 1, "Higher temperature increases output variability."),
  makeQuestion("ai-13", "Zero-shot prompting means:", ["No model", "Task without examples", "No internet", "No tokenizer"], 1, "Zero-shot asks model to perform with instructions only."),
  makeQuestion("ai-14", "Model latency is:", ["Color accuracy", "Time taken to produce output", "Storage size", "CPU brand"], 1, "Latency measures response delay."),
  makeQuestion("ai-15", "A vector database is useful for:", ["Video rendering", "Similarity search over embeddings", "Email delivery", "Compilers"], 1, "Vector DBs optimize nearest-neighbor retrieval."),
  makeQuestion("ai-16", "Guardrails in AI systems are for:", ["Improving monitor brightness", "Safety and policy constraints", "Changing language", "Adding random output"], 1, "Guardrails keep outputs aligned and safe."),
  makeQuestion("ai-17", "Inference cost depends on:", ["Only user name", "Model size and tokens", "Desk setup", "Git branch"], 1, "Larger models and more tokens raise cost."),
  makeQuestion("ai-18", "A/B testing in AI products helps:", ["Remove metrics", "Compare variants with users", "Disable logging", "Avoid feedback"], 1, "A/B testing validates what works better."),
  makeQuestion("ai-19", "Multimodal models can process:", ["Only numbers", "Text, image, and more modalities", "Only SQL", "Only speech"], 1, "Multimodal systems combine multiple data types."),
  makeQuestion("ai-20", "Evaluation sets should be:", ["Identical to train set", "Representative and unbiased", "Hidden forever", "Randomly empty"], 1, "Representative eval data gives meaningful performance checks.")
];

function makeCourse(id, title, subtitle, questions) {
  return {
    id,
    title,
    subtitle,
    levels: splitToLevels(questions)
  };
}

export const QUIZ_COURSES = [
  makeCourse("devops", "DevOps", "CI/CD, infra, and reliability", DEVOPS_QUESTIONS),
  makeCourse("ai", "AI", "ML and LLM fundamentals", AI_QUESTIONS),
  makeCourse("software-engineering", "Software Engineering", "Design, quality, and delivery", DEVOPS_QUESTIONS),
  makeCourse("automation-testing", "Automation Testing", "Test strategy and frameworks", AI_QUESTIONS),
  makeCourse("frontend", "Front End Development", "UI, performance, and accessibility", DEVOPS_QUESTIONS),
  makeCourse("fullstack", "Full Stack Development", "End-to-end app engineering", AI_QUESTIONS)
];

