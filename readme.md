# FRAML — User & Transaction Relationship Visualization System

A graph-based system for visualizing relationships between user accounts using transaction data and shared attributes. Users and transactions are stored as nodes in a Neo4j graph database, relationships are detected automatically (shared emails, phones, IPs, devices), and everything is explored through an interactive browser-based UI.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Graph Database | Neo4j 4.4 LTS |
| Backend API | Python, FastAPI |
| Frontend | React 18, Vite, Vis.js |
| Containerization | Docker, Docker Compose |
| Data Generation | Python, Faker (Indian locale) |

---

## Project Structure

```
framl-graph/
├── backend/
│   ├── database.py        # Neo4j driver connection
│   ├── Dockerfile
│   ├── main.py            # All REST API endpoints
│   ├── models.py          # Pydantic models — User and Transaction
│   ├── relationships.py   # Auto relationship detection logic
│   └── requirements.txt
├── frontend/
│   ├── Dockerfile
│   └── framl.jsx          # Full React frontend (single file)
├── scripts/
│   └── seed_data.py       # Data generation script (510 users, 100k transactions)
├── docker-compose.yml
└── readme.md
```

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- [Node.js LTS](https://nodejs.org) installed (for the React frontend)
- At least **6 GB RAM** allocated to Docker (Neo4j + 100k transactions needs it)
  - Docker Desktop → Settings → Resources → Memory → set to 6 GB or more

---

## Quick Start

### Step 1 — Clone the repository

```bash
git clone https://github.com/prachijindall/Framl-graph
cd framl-graph
```

### Step 2 — Start all containers

```bash
docker compose up --build -d
```

This starts two containers:
- `framl-neo4j` — Neo4j graph database (ports 7474, 7687)
- `framl-backend` — FastAPI backend (port 8000)

Neo4j takes about 45–60 seconds to become healthy on first boot. The backend waits for it automatically.

### Step 3 — Load the seed data

Copy the seed script into the running backend container, then execute it:

```bash
docker cp scripts/seed_data.py framl-backend:/app/seed_data.py
docker exec -it framl-backend python seed_data.py
```

This generates and loads:
- **510 users** with Indian names, emails, phones, and addresses
- **100,000 transactions** in INR with realistic risk scoring
- All graph relationships (shared attributes, IP links, device links)

Expected output:
```
Starting FRAML seed data generation...
Creating indexes for fast bulk loading...
  ✓ Indexes ready
Saving 510 users...
  ✓ 510 users saved
Saving 100000 transactions...
  ✓ 100000 transactions saved
Creating graph relationships...
  Linking users → transactions (INITIATED)...
  Linking shared emails...
  Linking same-IP transactions (TX→TX)...
  ...
 Database is ready! 510 users and 100,000 transactions loaded.
```

This takes approximately **5–10 minutes** depending on your machine.

### Step 4 — Run the React Frontend

Open a new terminal and navigate to the frontend folder:

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
```

### Step 5 — Open the app

| Service | URL |
|---|---|
| Frontend (main UI) | http://localhost:5173 |
| Backend API docs (Swagger) | http://localhost:8000/docs |
| Neo4j Browser | http://localhost:7474 |

Neo4j browser credentials: `neo4j` / `password123`

---

## Stopping and Restarting

```bash
# Stop containers (keeps data)
docker compose down

# Stop and wipe all data (start fresh)
docker compose down -v

# Restart without rebuilding
docker compose up -d
```

---

## API Reference

All endpoints are also available interactively at `http://localhost:8000/docs`.

### Users

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/users` | Add or update a user |
| `GET` | `/users` | List users — supports `?search=`, `?limit=`, `?skip=` |

**POST /users — example body:**
```json
{
  "id": "U-00001",
  "name": "Arjun Mehta",
  "email": "arjun@example.com",
  "phone": "+91-98765-43210",
  "address": "Flat No. 12, MG Road, Mumbai, Maharashtra - 400001",
  "payment_method": "visa_4242"
}
```

**GET /users — query parameters:**

| Parameter | Example | Description |
|---|---|---|
| `search` | `?search=arjun` | Filter by name, email, phone, or user ID |
| `limit` | `?limit=50` | Results per page (max 500) |
| `skip` | `?skip=100` | Pagination offset |

---

### Transactions

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/transactions` | Add or update a transaction |
| `GET` | `/transactions` | List transactions with filters and sorting |

**POST /transactions — example body:**
```json
{
  "id": "TX-000001",
  "sender_id": "U-00001",
  "receiver_id": "U-00042",
  "amount": 125000.00,
  "currency": "INR",
  "timestamp": "2024-06-15T14:30:00",
  "ip_address": "103.21.58.12",
  "device_id": "a8f3b21c",
  "status": "review",
  "risk_score": 0.55
}
```

**GET /transactions — query parameters:**

| Parameter | Example | Description |
|---|---|---|
| `search` | `?search=TX-000001` | Filter by TX ID, sender, or receiver |
| `status` | `?status=flagged` | Filter by status: `clear`, `review`, `flagged` |
| `min_amount` | `?min_amount=10000` | Minimum transaction amount in INR |
| `max_amount` | `?max_amount=500000` | Maximum transaction amount in INR |
| `sort_by` | `?sort_by=amount` | Sort field: `timestamp`, `amount`, `risk_score` |
| `order` | `?order=desc` | Sort direction: `asc` or `desc` |
| `limit` | `?limit=50` | Results per page (max 500) |
| `skip` | `?skip=0` | Pagination offset |

---

### Relationships

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/relationships/user/:id` | All connections of a user |
| `GET` | `/relationships/transaction/:id` | All connections of a transaction |

**GET /relationships/user/U-00001 — example response:**
```json
{
  "user_id": "U-00001",
  "connections": {
    "sent_to": [...],
    "shared_email": [...],
    "shared_phone": [...],
    "shared_address": [...],
    "shared_payment": [...],
    "transactions": [...]
  }
}
```

**GET /relationships/transaction/TX-000001 — example response:**
```json
{
  "transaction_id": "TX-000001",
  "connections": {
    "users": [
      { "data": {...}, "link_type": "INITIATED" },
      { "data": {...}, "link_type": "RECEIVED" }
    ],
    "linked_transactions": [
      { "data": {...}, "link_type": "SAME_IP" },
      { "data": {...}, "link_type": "SAME_DEVICE" }
    ]
  }
}
```

---

### Analytics & Export

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/analytics/stats` | Total counts — users, transactions, flagged |
| `GET` | `/analytics/shortest-path?user1_id=&user2_id=` | Shortest connection path between two users |
| `GET` | `/export/transactions` | All transactions as JSON download |
| `GET` | `/export/transactions/csv` | All transactions as CSV download |
| `GET` | `/export/users/csv` | All users as CSV download |

---

## Relationship Detection Logic

Relationships are detected automatically every time a user or transaction is created via the API. During bulk seeding they are built in a single optimized pass.

### User → User (Shared Attributes)

| Relationship | Trigger |
|---|---|
| `SHARED_EMAIL` | Two users have the same email address |
| `SHARED_PHONE` | Two users share a phone number |
| `SHARED_ADDRESS` | Two users share a physical address |
| `SHARED_PAYMENT` | Two users share a payment method |

### User → Transaction

| Relationship | Trigger |
|---|---|
| `INITIATED` | User is the sender of the transaction |
| `RECEIVED` | User is the receiver of the transaction |
| `SENT` | Direct user-to-user money link |

### Transaction → Transaction

| Relationship | Trigger |
|---|---|
| `SAME_IP` | Two transactions came from the same IP address |
| `SAME_DEVICE` | Two transactions came from the same device ID |

---

## Frontend Features

**Dashboard**
- Live stats — total users, transactions, flagged count
- Interactive Vis.js graph with all relationship types rendered
- Edge colors differentiate relationship types (see legend below)
- Click any node to see details in the status bar
- Filter graph by relationship type (All / Flagged / by type card)

**Users page**
- Searchable and paginated table
- Export users as JSON or CSV
- Click Inspect on any row to jump to that user's relationship graph

**Transactions page**
- Filter by status (clear / review / flagged)
- Sort by amount, date, or risk score
- Filter by amount range
- Export transactions as JSON or CSV
- Click Links on any row to see that transaction's connections

**Relationships page**
- User connection explorer — enter any User ID to see all their links
- Transaction connection explorer — enter any TX ID to see linked users and transactions
- Mini Vis.js graph for each lookup

**Analytics page**
- Shortest path finder — find the chain of connections between any two users
- Export panel — JSON and CSV downloads for both users and transactions

### Graph Edge Colors

| Color | Relationship |
|---|---|
| Cyan | User → Transaction (Credit/Debit) |
| Red | Shared Email |
| Pink | Shared Phone |
| Orange | Shared Address |
| Amber | Shared Payment |
| Purple | Same IP (TX→TX) |
| Violet | Same Device (TX→TX) |

---

## Seed Data Details

The `seed_data.py` script generates realistic Indian financial data with intentional suspicious patterns for demo purposes.

**Users (510 total)**
- Indian names, emails, phone numbers (+91 format), addresses, and payment methods
- 30% chance of sharing an email with another user
- 25% chance of sharing a phone number
- 20% chance of sharing an address or payment method
- This creates natural clusters of suspicious shared-attribute links

**Transactions (100,000 total)**
- Amounts in INR ranging from ₹500 to ₹50,00,000
- 15% chance of using a shared IP address
- 10% chance of using a shared device ID
- Risk scoring: shared IP adds 0.4, shared device adds 0.3, amount > ₹10 lakh adds 0.2
- Status: `flagged` (risk > 0.7), `review` (risk > 0.4), `clear` (otherwise)

---

## Triggering Seed Data

There are two ways to load the seed data:

**Option A — Copy and run inside Docker (recommended):**
```bash
docker cp scripts/seed_data.py framl-backend:/app/seed_data.py
docker exec -it framl-backend python seed_data.py
```

**Option B — From outside Docker (if Python is installed locally):**
```bash
cd backend
pip install -r requirements.txt
NEO4J_URI=bolt://localhost:7687 python seed_data.py
```

The script is safe to run multiple times — it uses `MERGE` so it will not create duplicate nodes.

---

## Testing the API

You can test all endpoints directly in the browser at `http://localhost:8000/docs` (Swagger UI) or using curl:

```bash
# Check the system is up
curl http://localhost:8000/analytics/stats

# Get first 10 users
curl "http://localhost:8000/users?limit=10"

# Search for a user
curl "http://localhost:8000/users?search=U-00001"

# Get flagged transactions sorted by risk
curl "http://localhost:8000/transactions?status=flagged&sort_by=risk_score&order=desc&limit=10"

# Get all connections of user U-00001
curl http://localhost:8000/relationships/user/U-00001

# Get all connections of transaction TX-000001
curl http://localhost:8000/relationships/transaction/TX-000001

# Find shortest path between two users
curl "http://localhost:8000/analytics/shortest-path?user1_id=U-00001&user2_id=U-00050"

# Download transactions as CSV
curl -O http://localhost:8000/export/transactions/csv
```

---

## Troubleshooting

**Neo4j container fails to start**

Make sure Docker has at least 6 GB of RAM allocated:
Docker Desktop → Settings → Resources → Memory → 6144 MB

Then wipe and restart:
```bash
docker compose down -v
docker compose up --build -d
```

**Seed script runs out of memory**

The SAME_IP and SAME_DEVICE relationship queries process one IP/device value at a time to stay within Neo4j's memory limits. If you still hit issues, reduce the transaction count temporarily:

Inside `seed_data.py`, change line:
```python
txs = make_transactions(users, 100000)
```
to:
```python
txs = make_transactions(users, 50000)
```

**Backend can't connect to Neo4j**

Neo4j takes up to 60 seconds to be ready. If the backend starts before Neo4j is healthy, restart it:
```bash
docker restart framl-backend
```

**Frontend not loading**

Make sure you have run `npm install` inside the `frontend` folder and that the dev server is running on port 5173. Also confirm the backend is up at `http://localhost:8000` before opening the UI.

**Port already in use**

If ports 7474, 7687, or 8000 are occupied, stop the conflicting process or change the port mappings in `docker-compose.yml`.

---

## Environment Variables

These are pre-configured in `docker-compose.yml`. Only change them if you know what you are doing.

| Variable | Default | Service |
|---|---|---|
| `NEO4J_AUTH` | `neo4j/password123` | neo4j |
| `NEO4J_URI` | `bolt://neo4j:7687` | backend |
| `NEO4J_USER` | `neo4j` | backend |
| `NEO4J_PASSWORD` | `password123` | backend |