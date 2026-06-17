#PulseApex: Multi-Agent Autonomous Corporate Compliance Auditor
🔗 Live Deployment | 🚀 Powered by CrewAI & FastAPI
PulseApex is an enterprise-grade, full-stack compliance automation pipeline designed to systematically ingest corporate documents, parse multi-format data streams, and audit text blocks against fine-grained organizational policies. By leveraging an asynchronous multi-agent framework, PulseApex replaces slow, error-prone manual auditing cycles with real-time anomaly detection, actionable correction scripts, and a human-in-the-loop review interface.

#🏗️ System Architecture & Data Flow
PulseApex uses a decoupled, event-driven architecture split into a high-performance backend processing engine and a real-time reactive user dashboard.


[ Client UI: Next.js ] ──( HTTP POST / Upload )──> [ Backend API: FastAPI ]
         │                                                 │
   (WebSocket /ws)                                  (Database Ledger)
         │                                                 │
         ▼                                                 ▼
[ Real-Time Log Terminal ] <──( Live Stream )── [ CrewAI Orchestration Engine ]
                                                           │
                                             ┌─────────────┼─────────────┐
                                             ▼             ▼             ▼
                                        [Parser]      [Auditor]       [Patch]
                                             │             │             │
                                             └─────────────┼─────────────┘
                                                           ▼
                                                    [Verification QA]
                                                           │
                                                    (Critical Breach)
                                                           ▼
                                                    [ HITL Gateway ]
 🔁 Detailed Process LifecycleDocument Ingestion: The client drops a document via the frontend drop-zone (page.tsx), firing a multi-part form request to the FastAPI gateway. The system immediately registers a unique tracking ID in the PostgreSQL database.  Text Layer Extraction: The DocumentParserService tokenizes the file contents into clean string buffers.Policy Synchronization: The system pulls active organizational guidelines from the database via SQLAlchemy. If no custom parameters are set, it seamlessly pairs execution with a default industry-standard compliance context.Asynchronous Agent Orchestration: The payload enters the CrewAI Sequential Network, passing state sequentially through 4 highly optimized agents running Gemini 3.5 Flash models.Real-Time Streaming: Throughout execution, agent thought loops and evaluation states are pushed down a secure client-side WebSocket (ws://) pipeline directly onto the frontend dashboard terminal.  State Persistence & HITL Gate: Verified violations are saved into the relational database as typed AuditFinding records. If severe policy breaches occur, the platform pauses downstream processing and locks system state until a manager passes a human-in-the-loop (HITL) approval gate.🛠️ The Tech StackFrontend Dashboard: Next.js, React, TypeScript, Tailwind CSS  Orchestration Layer: CrewAI Framework, LangChain, Advanced Prompt Engineering  AI Core Engine: Gemini 3.5 Flash (via Google AI Studio)Backend Framework: FastAPI, Python Asyncio  Database & ORM: PostgreSQL, SQLAlchemy ORMReal-Time Communications: State-managed WebSockets  

 
🤖 Multi-Agent Network Breakdown
PulseApex breaks away from generic single-prompt LLM wrapper constraints by using an isolated, 4-tier behavioral network configured inside crew.py:
Agent,Responsibility,Core Task Function
1. Parser Agent,Structural Data Extraction,"Translates unformatted document strings into structured, schema-validated JSON blocks."
2. Auditor Agent,Compliance Compliance Cross-Referencing,Evaluates the JSON dataset directly against the organization's rules to identify exact text deviations.
3. Patch Specialist,Actionable Remediation Coding,"Rewrites faulty text blocks and generates exact, functional replacement scripts/clauses."
4. Verification QA,Quality Gates & Severity Assessment,"Eliminates systemic false positives, calibrates risk metrics (critical, high, medium, low), and aggregates final analytics scores."



🚀 Local Installation & Setup
Prerequisites
Python 3.10 or higher installed.

PostgreSQL database instance running locally or hosted on the cloud.

A Gemini API Key from Google AI Studio.

1. Clone the Repository
2. git clone https://github.com/Rashadpulse/AI_Code_Generation_Evaluation_Portfolio.git
cd AI_Code_Generation_Evaluation_Portfolio

2. Configure Environment Variables
Create a .env file in your root backend directory to isolate your environment variables safely.
# AI Model Configuration
GEMINI_API_KEY=your_gemini_api_key_here
MODEL_NAME=gemini/gemini-3.5-flash

# Database Infrastructure
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/pulseapex_db

# API & Gateway Settings
API_BASE_URL=http://localhost:8000
ENVIRONMENT=development

3. Run the Backend API Engine
4. # Navigate to backend, build virtual environment
cd backend
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`

# Install required packages
pip install -r requirements.txt

# Start the asynchronous Uvicorn server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

4. Boot Up the Next.js Frontend Dashboard
5. # Navigate to the frontend directory
cd ../frontend

# Install dependencies and launch dev server
npm install
npm run dev
Open http://localhost:3000 in your browser to begin testing.
🛡️ License
Distributed under the MIT License. See LICENSE.md for more information.
