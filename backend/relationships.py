from database import get_session

def detect_user_relationships(user_data: dict):
    """
    Called every time a new user is added.
    Automatically checks: does anyone else share
    this user's email, phone, address, or payment method?
    If yes → create a link between them in the graph.
    """
    session = get_session()
    user_id = user_data["id"]

    # ── CHECK 1: Shared Email ──
    # Find all other users with same email
    session.run("""
        MATCH (u1:User {id: $user_id})
        MATCH (u2:User {email: $email})
        WHERE u2.id <> $user_id
        MERGE (u1)-[:SHARED_EMAIL]->(u2)
    """, user_id=user_id, email=user_data["email"])

    # ── CHECK 2: Shared Phone ──
    session.run("""
        MATCH (u1:User {id: $user_id})
        MATCH (u2:User {phone: $phone})
        WHERE u2.id <> $user_id
        MERGE (u1)-[:SHARED_PHONE]->(u2)
    """, user_id=user_id, phone=user_data["phone"])

    # ── CHECK 3: Shared Address ──
    session.run("""
        MATCH (u1:User {id: $user_id})
        MATCH (u2:User {address: $address})
        WHERE u2.id <> $user_id
        MERGE (u1)-[:SHARED_ADDRESS]->(u2)
    """, user_id=user_id, address=user_data["address"])

    # ── CHECK 4: Shared Payment Method ──
    session.run("""
        MATCH (u1:User {id: $user_id})
        MATCH (u2:User {payment_method: $payment_method})
        WHERE u2.id <> $user_id
        MERGE (u1)-[:SHARED_PAYMENT]->(u2)
    """, user_id=user_id,
         payment_method=user_data["payment_method"])

    session.close()


def detect_transaction_relationships(tx_data: dict):
    """
    Called every time a new transaction is added.
    Automatically:
    1. Links sender User → Transaction
    2. Links receiver User → Transaction
    3. Links sender User → receiver User
    4. Finds other transactions with same IP → link them
    5. Finds other transactions with same device → link them
    """
    session = get_session()
    tx_id = tx_data["id"]
    sender_id = tx_data["sender_id"]
    receiver_id = tx_data["receiver_id"]

    # ── LINK 1: Sender participated in transaction ──
    session.run("""
        MATCH (u:User {id: $sender_id})
        MATCH (t:Transaction {id: $tx_id})
        MERGE (u)-[:INITIATED]->(t)
    """, sender_id=sender_id, tx_id=tx_id)

    # ── LINK 2: Receiver participated in transaction ──
    session.run("""
        MATCH (u:User {id: $receiver_id})
        MATCH (t:Transaction {id: $tx_id})
        MERGE (u)-[:RECEIVED]->(t)
    """, receiver_id=receiver_id, tx_id=tx_id)

    # ── LINK 3: Direct user-to-user money link ──
    session.run("""
        MATCH (sender:User {id: $sender_id})
        MATCH (receiver:User {id: $receiver_id})
        MERGE (sender)-[:SENT {tx_id: $tx_id}]->(receiver)
    """, sender_id=sender_id, receiver_id=receiver_id,
         tx_id=tx_id)

    # ── LINK 4: Same IP address = suspicious link ──
    # Find all other transactions from same IP
    session.run("""
        MATCH (t1:Transaction {id: $tx_id})
        MATCH (t2:Transaction {ip_address: $ip_address})
        WHERE t2.id <> $tx_id
        MERGE (t1)-[:SAME_IP]->(t2)
    """, tx_id=tx_id, ip_address=tx_data["ip_address"])

    # ── LINK 5: Same device ID = suspicious link ──
    session.run("""
        MATCH (t1:Transaction {id: $tx_id})
        MATCH (t2:Transaction {device_id: $device_id})
        WHERE t2.id <> $tx_id
        MERGE (t1)-[:SAME_DEVICE]->(t2)
    """, tx_id=tx_id, device_id=tx_data["device_id"])

    session.close()
