# Uni-Assistant · Interactive Tutorial Mode

This standalone folder (`tutorial-app/`) runs an interactive guided tour of **all Uni-Assistant features** without modifying the original application (`frontend/`, `backend/`, `ai-service/`), and without requiring PostgreSQL, Docker, or a Gemini API key.

## How to Open

### Tutorial App (Port `5174`)
```bash
cd tutorial-app
npm install
npm run dev
```
Then open **[http://localhost:5174](http://localhost:5174)** (or double-click `start-tutorial.bat` on Windows).

### Original App (Port `5173`)
Run the original stack as documented in the root `README.md`:
```bash
cd frontend
npm run dev
```
Then open **[http://localhost:5173](http://localhost:5173)**.

Because the Tutorial App uses port `5174` and the Original App uses port `5173`, you can run either one independently or even side-by-side.

## Features Covered in the Guided Tour (8 Chapters · 24 Steps)
1. **Authentication & Personas**: Institutional sign-in, New Applicant registration, Quick Test Personas, and public map entry.
2. **Standard Chat & Hybrid RAG**: Chat history, Concise vs. In-Depth explanations, verified PDF/DOCX citations, and response feedback.
3. **Autonomous Agent Mode (ReAct)**: Multi-step compound queries, expandable Agent Execution Plan trace, hallucination/number-grounding self-correction, and deep-linked map pills.
4. **Zero-Trust Privacy & RBAC**: Deterministic cross-student data blocking and role-scoped tools (Student vs. Teacher).
5. **Campus Wayfinding & Floor Plans**: Dijkstra shortest-path routing, door QR scan simulation, step-free elevator accessibility mode, interactive SVG floor plans, and Leaflet campus overview.
6. **HOD Department Portal**: All 8 tabs including Department Overview, Faculty Workload, Curriculum, Exam Scheduling, live Pending Classroom Allocation, Analytics, Notices, and Executive Report CSV/Print.
7. **Admin Control Center**: All 9 tabs including User/Role management, simulated RAG document chunking/indexing pipeline, real scannable QR placard generation, and System Telemetry.
8. **Free Interactive Sandbox**: Hide the coach card anytime to freely test prompts, roles, routes, and admin controls.
