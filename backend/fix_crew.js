const fs = require('fs');
const path = 'd:/My Projects/AGEIS AI/backend/app/agents/crew.py';
let content = fs.readFileSync(path, 'utf8');

// 1. Remove the incorrectly placed block inside the class
const brokenBlock = `
API_KEY = "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"
BASE_URL = "https://openrouter.ai/api/v1"

def get_openrouter_llm(model_name: str):
    from crewai import LLM
    # Prefixing with 'openrouter/' ensures internal LiteLLM routes correctly
    return LLM(
        model=f"openrouter/{model_name}",
        api_key=API_KEY,
        base_url=BASE_URL,
        temperature=0.1  # Low temperature for strict structural audit outputs
    )
`;

// Try to remove it using a regex that handles line ending variations
const regex = /API_KEY = "sk-or-v1.*?temperature=0\.1  # Low temperature for strict structural audit outputs\r?\n    \)/s;
content = content.replace(regex, '');

// 2. Insert at the top of the file, right after imports
const topBlock = `
API_KEY = "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"
BASE_URL = "https://openrouter.ai/api/v1"

def get_openrouter_llm(model_name: str):
    from crewai import LLM
    # Prefixing with 'openrouter/' ensures internal LiteLLM routes correctly
    return LLM(
        model=f"openrouter/{model_name}",
        api_key=API_KEY,
        base_url=BASE_URL,
        temperature=0.1  # Low temperature for strict structural audit outputs
    )
`;

content = content.replace(/import re\r?\n/, 'import re\n' + topBlock + '\n');

fs.writeFileSync(path, content);
console.log('Fixed crew.py syntax');
