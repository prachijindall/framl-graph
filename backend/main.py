from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from models import User, Transaction
from database import get_session
from relationships import (detect_user_relationships,
                           detect_transaction_relationships)
from typing import Optional
import csv
import io

# Create the app — this IS your API
app = FastAPI(title="FRAML Graph API")

# This allows the frontend (on port 3000) to call
# the backend (on port 8000) without being blocked
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ══════════════════════════════════
# USER ENDPOINTS
# ══════════════════════════════════

@app.post("/users", status_code=201)
def create_user(user: User):
    # When frontend sends POST /users with user data:
    # 1. Save user to Neo4j
    # 2. Auto-detect shared attribute links
    session = get_session()
    session.run("""
        MERGE (u:User {id: $id})
        SET u.name = $name,
            u.email = $email,
            u.phone = $phone,
            u.address = $address,
            u.payment_method = $payment_method
    """, **user.dict())
    session.close()
    detect_user_relationships(user.dict())
    return {"message": "User created", "id": user.id}


@app.get("/users")
def get_users(
    search: Optional[str] = None,   
    limit: int = Query(50, le=500), 
    skip: int = 0                   
):
    session = get_session()

    if search:
        result = session.run("""
            MATCH (u:User)
            WHERE toLower(u.name) CONTAINS toLower($search)
               OR toLower(u.email) CONTAINS toLower($search)
               OR toLower(u.id) CONTAINS toLower($search)
               OR toLower(u.phone) CONTAINS toLower($search)
            RETURN u SKIP $skip LIMIT $limit
        """, search=search, skip=skip, limit=limit)
    else:
        result = session.run("""
            MATCH (u:User)
            RETURN u SKIP $skip LIMIT $limit
        """, skip=skip, limit=limit)

    users = [dict(record["u"]) for record in result]
    session.close()
    return {"data": users, "total": len(users)}


# ══════════════════════════════════
# TRANSACTION ENDPOINTS
# ══════════════════════════════════

@app.post("/transactions", status_code=201)
def create_transaction(tx: Transaction):
    session = get_session()
    session.run("""
        MERGE (t:Transaction {id: $id})
        SET t.sender_id = $sender_id,
            t.receiver_id = $receiver_id,
            t.amount = $amount,
            t.currency = $currency,
            t.timestamp = $timestamp,
            t.ip_address = $ip_address,
            t.device_id = $device_id,
            t.status = $status,
            t.risk_score = $risk_score
    """, **tx.dict())
    session.close()
    detect_transaction_relationships(tx.dict())
    return {"message": "Transaction created", "id": tx.id}


@app.get("/transactions")
def get_transactions(
    search: Optional[str] = None,
    status: Optional[str] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    sort_by: str = "timestamp",
    order: str = "desc",
    limit: int = Query(50, le=500),
    skip: int = 0
):
    session = get_session()
    filters = []
    params = {"skip": skip, "limit": limit}

    if search:
        filters.append(
            "(toLower(t.id) CONTAINS toLower($search) OR toLower(t.sender_id) CONTAINS toLower($search) OR toLower(t.receiver_id) CONTAINS toLower($search))"
        )
        params["search"] = search
    if status:
        filters.append("t.status = $status")
        params["status"] = status
    if min_amount is not None:
        filters.append("t.amount >= $min_amount")
        params["min_amount"] = min_amount
    if max_amount is not None:
        filters.append("t.amount <= $max_amount")
        params["max_amount"] = max_amount

    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    order_dir = "DESC" if order == "desc" else "ASC"

    result = session.run(f"""
        MATCH (t:Transaction)
        {where}
        RETURN t
        ORDER BY t.{sort_by} {order_dir}
        SKIP $skip LIMIT $limit
    """, **params)

    data = [dict(r["t"]) for r in result]
    session.close()
    return {"data": data, "total": len(data)}


# ══════════════════════════════════
# RELATIONSHIP ENDPOINTS
# ══════════════════════════════════

@app.get("/relationships/user/{user_id}")
def get_user_relationships(user_id: str):
    # Returns EVERYTHING connected to a user:
    # - other users they transacted with
    # - users with shared email/phone/address/payment
    # - all their transactions
    session = get_session()
    result = session.run("""
        MATCH (u:User {id: $user_id})-[r]->(n)
        RETURN type(r) as rel_type,
               labels(n) as node_type,
               properties(n) as node_data
        UNION
        MATCH (n)-[r]->(u:User {id: $user_id})
        WHERE type(r) IN ['SHARED_EMAIL','SHARED_PHONE','SHARED_ADDRESS','SHARED_PAYMENT','SENT']
        RETURN type(r) as rel_type,
               labels(n) as node_type,
               properties(n) as node_data
    """, user_id=user_id)

    connections = {
        "sent_to": [],
        "shared_email": [],
        "shared_phone": [],
        "shared_address": [],
        "shared_payment": [],
        "transactions": []
    }

    seen = set()
    for record in result:
        rel  = record["rel_type"]
        node = record["node_data"]
        dedup_key = f"{rel}_{node.get('id','')}"
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        if rel == "SENT":
            connections["sent_to"].append(node)
        elif rel == "SHARED_EMAIL":
            connections["shared_email"].append(node)
        elif rel == "SHARED_PHONE":
            connections["shared_phone"].append(node)
        elif rel == "SHARED_ADDRESS":
            connections["shared_address"].append(node)
        elif rel == "SHARED_PAYMENT":
            connections["shared_payment"].append(node)
        elif rel in ["INITIATED", "RECEIVED"]:
            connections["transactions"].append(node)

    session.close()
    return {"user_id": user_id, "connections": connections}


@app.get("/relationships/transaction/{tx_id}")
def get_transaction_relationships(tx_id: str):
    # Returns everything connected to a transaction.
    session = get_session()
    result = session.run("""
        MATCH (n)-[r]->(t:Transaction {id: $tx_id})
        RETURN type(r) as rel_type,
               labels(n) as node_type,
               properties(n) as node_data
        UNION
        MATCH (t:Transaction {id: $tx_id})-[r]->(n)
        WHERE type(r) IN ['SAME_IP', 'SAME_DEVICE']
        RETURN type(r) as rel_type,
               labels(n) as node_type,
               properties(n) as node_data
    """, tx_id=tx_id)

    connections = {
        "users": [],
        "linked_transactions": []
    }

    seen = set()
    for record in result:
        node_type = record["node_type"]
        node      = record["node_data"]
        rel       = record["rel_type"]
        dedup_key = f"{rel}_{node.get('id','')}"
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        if "User" in node_type:
            connections["users"].append({"data": node, "link_type": rel})
        else:
            # Includes SAME_IP and SAME_DEVICE linked transactions
            connections["linked_transactions"].append({"data": node, "link_type": rel})

    session.close()
    return {"transaction_id": tx_id, "connections": connections}


# ══════════════════════════════════
# ANALYTICS ENDPOINTS
# ══════════════════════════════════

@app.get("/analytics/shortest-path")
def shortest_path(user1_id: str, user2_id: str):
    # Shortest chain of connections between any two users
    session = get_session()
    result = session.run("""
        MATCH path = shortestPath(
            (u1:User {id: $user1_id})-[*]-(u2:User {id: $user2_id})
        )
        RETURN [n in nodes(path) | n.id] as path_ids,
               length(path) as hops
    """, user1_id=user1_id, user2_id=user2_id)

    record = result.single()
    session.close()
    if not record:
        raise HTTPException(404, "No path found between users")
    return {"path": record["path_ids"], "hops": record["hops"]}


@app.get("/analytics/stats")
def get_stats():
    # Total counts for the dashboard hero section
    session = get_session()
    users   = session.run("MATCH (u:User) RETURN count(u) as c").single()["c"]
    txs     = session.run("MATCH (t:Transaction) RETURN count(t) as c").single()["c"]
    flagged = session.run("MATCH (t:Transaction {status:'flagged'}) RETURN count(t) as c").single()["c"]
    review  = session.run("MATCH (t:Transaction {status:'review'}) RETURN count(t) as c").single()["c"]
    clear   = session.run("MATCH (t:Transaction {status:'clear'}) RETURN count(t) as c").single()["c"]
    session.close()
    return {"users": users, "transactions": txs, "flagged": flagged, "review": review, "clear": clear}


# ══════════════════════════════════
# EXPORT ENDPOINTS
# ══════════════════════════════════

@app.get("/export/transactions")
def export_transactions_json():
    # All transactions as JSON
    session = get_session()
    result  = session.run("MATCH (t:Transaction) RETURN t")
    data    = [dict(r["t"]) for r in result]
    session.close()
    return {"data": data, "count": len(data)}


@app.get("/export/transactions/csv")
def export_transactions_csv():
    # Streams ALL transactions as a downloadable .csv file.
    # Python csv module handles quoting/escaping — safe for Excel & Sheets.
    session = get_session()
    result  = session.run("""
        MATCH (t:Transaction)
        RETURN t
        ORDER BY t.timestamp DESC
    """)
    rows = [dict(r["t"]) for r in result]
    session.close()

    if not rows:
        raise HTTPException(404, "No transactions to export")

    fieldnames = [
        "id", "sender_id", "receiver_id", "amount", "currency",
        "timestamp", "status", "risk_score", "ip_address", "device_id"
    ]

    buffer = io.StringIO()
    writer = csv.DictWriter(
        buffer, fieldnames=fieldnames,
        extrasaction="ignore", lineterminator="\n"
    )
    writer.writeheader()
    writer.writerows(rows)
    buffer.seek(0)

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=transactions_export.csv"}
    )


@app.get("/export/users/csv")
def export_users_csv():
    # Streams ALL users as a downloadable .csv file
    session = get_session()
    result  = session.run("MATCH (u:User) RETURN u ORDER BY u.id ASC")
    rows    = [dict(r["u"]) for r in result]
    session.close()

    if not rows:
        raise HTTPException(404, "No users to export")

    fieldnames = ["id", "name", "email", "phone", "address", "payment_method"]

    buffer = io.StringIO()
    writer = csv.DictWriter(
        buffer, fieldnames=fieldnames,
        extrasaction="ignore", lineterminator="\n"
    )
    writer.writeheader()
    writer.writerows(rows)
    buffer.seek(0)

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=users_export.csv"}
    )