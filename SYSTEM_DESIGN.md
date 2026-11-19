# 📐 System Design Document: SRS, HLD & LLD

> **Project Title:** AI-Powered University Smart Assistant (Uni-Assistant)  
> **Technologies:** React 18, Node.js / Express.js, Python / FastAPI, PostgreSQL 16 (`pgvector`), Google Gemini LLM  
> **Deliverable Scope:** Software Requirements Specification (SRS), High-Level Design (HLD), and Low-Level Design (LLD).

---

## Part 1: Software Requirements Specification (SRS)

### 1.1. Functional Requirements

- **FR-1: AI Chatbot Development (Task 1)**: Interactive natural-language interface with session persistence, follow-up context management, typing indicators, and conversation reset.
- **FR-2: University Admission Guidance (Task 2)**: Verified program eligibility, fee structures, application deadlines, and admission procedures from database records with strict anti-hallucination controls.
- **FR-3: Campus & Indoor Navigation (Task 3)**: Interactive Leaflet campus map, SVG architectural floor plans, turn-by-turn indoor directions, wheelchair-accessible routing, and physical QR placard origin identification.
- **FR-4: General Education Assistant (Task 4)**: Educational question answering across computer science, engineering, and mathematics; simple and detailed explanation modes; automated MCQ and assignment generation.
- **FR-5: Student Academic Assistant (Task 5)**: Personal class timetables, attendance percentages, upcoming examinations, personal marks, and administrative guidance with zero-trust privacy boundaries.
- **FR-6: Teacher Academic Assistant (Task 6)**: Teaching schedules, assigned curriculum subjects, instant classroom locator ("Where is my next classroom?"), lesson plan structuring, and automated test question drafting.
- **FR-7: HOD Department Assistant (Task 7)**: Department overview, faculty workload distribution, course curriculum, departmental schedule & examinations, pending bottlenecks (missing rooms, ungraded evaluations), aggregate-only analytics, printable executive reports, CSV data downloads, and live venue allocation.
- **FR-8: University Administration Assistant (Task 8)**: Retrieval of official university policies, fee payment regulations, hostel/transport guidelines, and student grievance procedures via Hybrid RAG.
- **FR-9: Administrative Control Center (Task 9)**: Knowledge base lifecycle (uploading PDF/DOCX, sentence-window chunking, vector indexing), user account management (creation, role switching, deactivation), department & faculty assignment, FAQ publisher, and system telemetry monitoring.

### 1.2. Non-Functional Requirements

- **NFR-1 (Zero-Trust Security & Privacy)**: User identity derived exclusively from validated JWTs and fresh database queries. Prompts inquiring about other students are rejected before reaching any LLM.
- **NFR-2 (Anti-Hallucination & Numerical Grounding)**: The system disallows inventing missing dates or fees. An automated ReAct self-correction guard verifies that all numerical figures in assistant drafts originate from database observations.
- **NFR-3 (High Availability & Failover)**: Dual-model LLM failover handles API rate limits (HTTP 429) automatically.
- **NFR-4 (Performance & Latency)**: Sub-second response times for standard database tool queries; sub-10ms path computation for campus Dijkstra navigation.
- **NFR-5 (Accessibility)**: Full support for step-free indoor routing (avoiding stairs in favor of elevators) and WCAG-compliant UI color contrast.

---

## Part 2: High-Level Design (HLD)

### 2.1. System Topology & Microservice Architecture

```mermaid
flowchart TB
    subgraph Client ["Frontend Tier (React 18 + Vite + Tailwind CSS)"]
        UI_Chat["💬 Chat Interface\n(Dual Mode & ReAct Agent)"]
        UI_HOD["🏛️ HOD Portal\n(Workloads, Reports, Venue Allocation)"]
        UI_Admin["⚙️ Admin Portal\n(Users, Departments, RAG, FAQs)"]
        UI_Nav["🗺️ Campus Wayfinding\n(Leaflet + Dynamic SVG Floor Plans)"]
    end

    subgraph Gateway ["Backend API Tier (Node.js + Express)"]
        Sec_MW["Security & Auth Middleware\n(Helmet, CORS, JWT, Rate Limiter)"]
        Router["Orchestrator & Deterministic Guard\n(Privacy Checker & Tool Router)"]
        Agent_Loop["ReAct Agent Execution Engine\n(Multi-Turn Tool Execution)"]
        Campus_Svc["Campus Graph Service\n(Dijkstra MinHeap Pathfinding)"]
        HOD_Svc["HOD Department Service\n(Strict Zero-Trust Department Scoping)"]
        Tools_Reg["Tool Registry (14+ Tools)\n(Attendance, Timetable, Exams, Marks)"]
    end

    subgraph AIService ["AI Microservice Tier (Python + FastAPI)"]
        AI_GW["FastAPI Gateway\n(X-Service-Token Protected)"]
        Ingest_Engine["Ingestion Engine\n(PDF/DOCX Sentence-Window Chunking)"]
        LLM_Provider["LLM Provider Service\n(Gemini 2.5/3.5 with Quota Failover)"]
        ReAct_Planner["ReAct Agent Planner\n(Structured JSON Thought/Action)"]
    end

    subgraph DataStorage ["Storage Tier"]
        PG_DB[("PostgreSQL 16\nRelational Schema & Audit Logs")]
        PG_Vector[("pgvector Extension\n768-dim Embeddings + tsvector Index")]
        Local_Disk[("Local Storage\nSource PDFs / DOCXs")]
    end

    Client -->|HTTPS / JWT| Sec_MW
    Sec_MW --> Router
    Router --> Tools_Reg
    Router --> Agent_Loop
    Router --> Campus_Svc
    Router --> HOD_Svc

    Agent_Loop --> Tools_Reg
    Tools_Reg --> PG_DB
    HOD_Svc --> PG_DB
    Campus_Svc --> PG_DB

    Router -->|Internal HTTP / Service Token| AI_GW
    Agent_Loop -->|Internal HTTP / Service Token| AI_GW
    AI_GW --> LLM_Provider
    AI_GW --> ReAct_Planner
    AI_GW --> Ingest_Engine

    Ingest_Engine --> Local_Disk
    Ingest_Engine --> PG_Vector
    Router -->|RAG Cosine + BM25 Search| PG_Vector
```

---

## Part 3: Low-Level Design (LLD)

### 3.1. ReAct Autonomous Agent Planning Loop

When a user asks complex compound questions (e.g. *"What is my attendance, which subjects am I at risk in, and where is my next class?"*), the system activates the autonomous ReAct agent loop:

```mermaid
stateDiagram-v2
    [*] --> FormulateThought: User Query Received
    FormulateThought --> CallTool: Planner Outputs Tool & Arguments
    CallTool --> ExecuteTool: Express Backend Executes Permitted Tool
    ExecuteTool --> InjectObservation: Tool Returns Observation Data
    InjectObservation --> EvaluateNextStep: Step Count < Limit (5 steps)
    
    EvaluateNextStep --> FormulateThought: More Data Required
    EvaluateNextStep --> SynthesizeDraft: Final Answer Reached
    
    SynthesizeDraft --> NumericalGuard: Scan Figures in Draft
    NumericalGuard --> OutputResponse: All Numbers Grounded in Observations
    NumericalGuard --> TriggerSelfCorrection: Hallucinated Figure Detected
    TriggerSelfCorrection --> SynthesizeDraft: Correct Draft with Observation Data
    OutputResponse --> [*]
```

#### Numerical Grounding Guard Algorithm:
1. Extract all numeric tokens (integers, percentages, decimals) from the agent's drafted answer.
2. Filter out conversational numbers (e.g., "1st", "2026", step numbers).
3. Verify that every remaining number exists verbatim in the tool observation payload.
4. If an ungrounded number is detected, trigger an automated repair prompt passing the ungrounded tokens and raw observations to produce a corrected response.

---

### 3.2. Campus Spatial Wayfinding Engine (Dijkstra with MinHeap)

Campus navigation computes optimal walking routes between any two campus locations, rooms, or scanned QR placards:

```mermaid
sequenceDiagram
    participant User as Client (Campus UI)
    participant Svc as Campus Graph Service
    participant Heap as Binary MinHeap
    participant SVG as Dynamic SVG Renderer

    User->>Svc: route(from: "QR-GATE", to: "Room 201 (BCA)", accessible: false)
    Svc->>Svc: Resolve Origin and Destination Node IDs
    Svc->>Heap: Initialize Distances (Origin = 0, others = Inf)
    
    loop Dijkstra Pathfinding
        Heap->>Svc: Extract Min Distance Node u
        alt Node u is Destination
            Svc->>Svc: Break Loop
        else Process Neighbors
            Svc->>Svc: Iterate Edges (u, v, distance)
            alt accessible is true AND edge.is_accessible is false
                Svc->>Svc: Skip Edge (Exclude Stairs)
            else Valid Edge
                Svc->>Heap: Relax Edge: if dist[u] + w < dist[v], update
            end
        end
    end

    Svc->>Svc: Backtrack Predecessors to Build Path Nodes
    Svc->>Svc: Generate Turn-by-Turn Natural Directions
    Svc->>SVG: Compute Floor Polyline Coordinates
    Svc-->>User: Return Route JSON (total_distance_m, steps, polyline)
```

---

### 3.3. Hybrid Document Ingestion & RAG (Reciprocal Rank Fusion)

The hybrid RAG pipeline ensures that institutional documentation is retrieved accurately using both semantic vector search and exact keyword matching:

```mermaid
flowchart LR
    Doc["PDF / DOCX File"] --> Parse["Magic Byte Check\n& Page Extraction"]
    Parse --> Chunk["Sentence-Window Splitter\n(1,000 chars, 150 overlap)"]
    Chunk --> Embed["Gemini Embedding\n(768 dimensions)"]
    Chunk --> TSVector["to_tsvector('english')"]
    Embed --> DB[("PostgreSQL\ndocument_chunks")]
    TSVector --> DB

    Query["User Query"] --> Q_Vec["Generate Query Embedding"]
    Query --> Q_KW["Generate tsquery"]
    
    Q_Vec --> Cosine["HNSW Cosine Similarity Rank"]
    Q_KW --> BM25["Full-Text ts_rank Rank"]
    
    Cosine --> RRF["Reciprocal Rank Fusion\nRRF Score = 1 / (60 + Rank)"]
    BM25 --> RRF
    
    RRF --> TopK["Top-K Supporting Chunks"]
    TopK --> LLM["Grounded Answer Synthesis"]
```

---

### 3.4. Zero-Trust RBAC & Department Data Isolation

Security is enforced at the database query level to prevent horizontal privilege escalation:

1. **Authentication Verification**: All requests pass through `authenticate`, verifying the signature and expiration of the JWT token.
2. **Fresh User Resolution**: The user's role and account status (`is_active = true`) are re-verified on every request.
3. **Department Scoping**:
   - For all HOD operations, `getHodDepartment(userId)` resolves `department_id` from `departments.hod_user_id = $1`.
   - Every subsequent query (`SELECT`, `INSERT`, `UPDATE`) joins `courses` and `departments` using the resolved department ID:
     ```sql
     SELECT e.id FROM examinations e
       JOIN subjects s ON s.id = e.subject_id
       JOIN courses c ON c.id = s.course_id
      WHERE e.id = $1 AND c.department_id = $resolvedDepartmentId
     ```
   - This ensures that a Computer Science HOD cannot view, schedule, or allocate venues for Management examinations under any circumstances.
