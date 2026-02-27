from faker import Faker
from neo4j import GraphDatabase
import random, uuid
from datetime import datetime, timedelta

fake = Faker('en_IN')  # Indian locale for realistic data

driver = GraphDatabase.driver(
    "bolt://neo4j:7687",
    auth=("neo4j", "password123")
)

# Indian cities for address generation 
INDIAN_CITIES = [
    "Mumbai, Maharashtra", "Delhi, Delhi", "Bengaluru, Karnataka",
    "Hyderabad, Telangana", "Chennai, Tamil Nadu", "Kolkata, West Bengal",
    "Pune, Maharashtra", "Ahmedabad, Gujarat", "Jaipur, Rajasthan",
    "Surat, Gujarat", "Lucknow, Uttar Pradesh", "Kanpur, Uttar Pradesh",
    "Nagpur, Maharashtra", "Indore, Madhya Pradesh", "Thane, Maharashtra",
    "Bhopal, Madhya Pradesh", "Visakhapatnam, Andhra Pradesh", "Patna, Bihar",
    "Vadodara, Gujarat", "Ghaziabad, Uttar Pradesh"
]


def indian_phone():
    """Generate a valid Indian mobile number: +91-XXXXX-XXXXX"""
    first_digit = random.choice(['6', '7', '8', '9'])
    remaining = ''.join([str(random.randint(0, 9)) for _ in range(9)])
    number = first_digit + remaining
    return f"+91-{number[:5]}-{number[5:]}"


def indian_address():
    """Generate an Indian-style address"""
    flat = random.choice(["Flat", "House", "Shop", "Plot", "Block"])
    num  = random.randint(1, 999)
    streets = [
        "MG Road", "Linking Road", "Brigade Road", "Anna Salai",
        "Park Street", "SV Road", "Nehru Nagar", "Gandhi Colony",
        "Sector 18", "Model Town", "Vasant Vihar", "Koramangala",
        "Andheri West", "Bandra East", "Whitefield", "Indiranagar",
        "Juhu Beach Road", "Connaught Place", "Karol Bagh", "Lajpat Nagar"
    ]
    city = random.choice(INDIAN_CITIES)
    pin  = f"{random.randint(100, 999)}{random.randint(100, 999)}"
    return f"{flat} No. {num}, {random.choice(streets)}, {city} - {pin}"


def make_users(total=510):
    """
    Creates users with Indian data.
    FIX: bumped to 510 to meet spec minimum.
    Intentionally makes some share email/phone/address/payment
    so the graph has interesting suspicious connections.
    """
    shared_emails    = [fake.email() for _ in range(20)]
    shared_phones    = [indian_phone() for _ in range(20)]
    shared_addresses = [indian_address() for _ in range(15)]
    shared_payments  = [f"card_{random.randint(1000,9999)}" for _ in range(15)]

    users = []
    for i in range(total):
        users.append({
            "id": f"U-{str(i+1).zfill(5)}",
            "name": fake.name(),
            # 30% chance of suspicious shared email
            "email": (random.choice(shared_emails)
                      if random.random() < 0.3 else fake.email()),
            "phone": (random.choice(shared_phones)
                      if random.random() < 0.25 else indian_phone()),
            "address": (random.choice(shared_addresses)
                        if random.random() < 0.2 else indian_address()),
            "payment_method": (random.choice(shared_payments)
                               if random.random() < 0.2
                               else f"card_{random.randint(1000,9999)}")
        })
    return users


def make_transactions(users, total=100000):
    """
    FIX: default is now 100,000 to meet spec minimum.
    Some share IP addresses or device IDs on purpose
    so the graph shows suspicious TX→TX clusters.
    """
    shared_ips     = [fake.ipv4() for _ in range(50)]
    shared_devices = [str(uuid.uuid4())[:8] for _ in range(50)]
    user_ids       = [u["id"] for u in users]
    start          = datetime.now() - timedelta(days=365)
    txs            = []

    for i in range(total):
        sender   = random.choice(user_ids)
        receiver = random.choice([u for u in user_ids if u != sender])

        # 15% chance of shared IP (suspicious cluster)
        ip     = (random.choice(shared_ips)   if random.random() < 0.15 else fake.ipv4())
        # 10% chance of shared device (suspicious cluster)
        device = (random.choice(shared_devices) if random.random() < 0.10 else str(uuid.uuid4())[:8])

        # Indian rupee amounts — typical range ₹500 to ₹50,00,000
        amount = round(random.uniform(500, 5000000), 2)

        risk = 0.05
        if ip in shared_ips:          risk += 0.4
        if device in shared_devices:  risk += 0.3
        if amount > 1000000:          risk += 0.2   # > ₹10 lakh is suspicious
        risk   = round(min(risk, 1.0), 2)
        status = ("flagged" if risk > 0.7 else "review" if risk > 0.4 else "clear")

        date = start + timedelta(seconds=random.randint(0, 365 * 24 * 3600))

        txs.append({
            "id":          f"TX-{str(i+1).zfill(6)}",
            "sender_id":   sender,
            "receiver_id": receiver,
            "amount":      amount,
            "currency":    "INR",
            "timestamp":   date.isoformat(),
            "ip_address":  ip,
            "device_id":   device,
            "status":      status,
            "risk_score":  risk
        })

    return txs


def create_indexes():
    """
    Create Neo4j indexes BEFORE bulk loading.
    This makes MERGE and relationship queries dramatically faster,
    especially for the 100k transaction SAME_IP / SAME_DEVICE passes.
    """
    print("Creating indexes for fast bulk loading...")
    with driver.session() as s:
        s.run("CREATE INDEX user_id_idx IF NOT EXISTS FOR (u:User) ON (u.id)")
        s.run("CREATE INDEX tx_id_idx IF NOT EXISTS FOR (t:Transaction) ON (t.id)")
        s.run("CREATE INDEX tx_ip_idx IF NOT EXISTS FOR (t:Transaction) ON (t.ip_address)")
        s.run("CREATE INDEX tx_device_idx IF NOT EXISTS FOR (t:Transaction) ON (t.device_id)")
        s.run("CREATE INDEX user_email_idx IF NOT EXISTS FOR (u:User) ON (u.email)")
        s.run("CREATE INDEX user_phone_idx IF NOT EXISTS FOR (u:User) ON (u.phone)")
    print("  ✓ Indexes ready")


def save_users(users):
    print(f"Saving {len(users)} users...")
    with driver.session() as s:
        # Batches of 500 for speed
        for i in range(0, len(users), 500):
            batch = users[i:i+500]
            s.run("""
                UNWIND $batch AS u
                MERGE (user:User {id: u.id})
                SET user += u
            """, batch=batch)
            print(f"  ✓ {i+len(batch)} users saved")


def save_transactions(txs):
    print(f"Saving {len(txs)} transactions...")
    with driver.session() as s:
        # Batches of 1000 for speed
        for i in range(0, len(txs), 1000):
            batch = txs[i:i+1000]
            s.run("""
                UNWIND $batch AS t
                MERGE (tx:Transaction {id: t.id})
                SET tx += t
            """, batch=batch)
            if (i // 1000) % 10 == 0:   # print every 10k
                print(f"  ✓ {i+len(batch)} transactions saved")
    print(f"  ✓ All {len(txs)} transactions saved")


def create_relationships():
    """
    Build all graph edges after nodes are loaded.
    Running this after bulk insert (rather than per-transaction) is much faster.
    """
    print("Creating graph relationships...")
    with driver.session() as s:

        print("  Linking users → transactions (INITIATED)...")
        s.run("""
            MATCH (u:User), (t:Transaction)
            WHERE u.id = t.sender_id
            MERGE (u)-[:INITIATED]->(t)
        """)

        print("  Linking users → transactions (RECEIVED)...")
        s.run("""
            MATCH (u:User), (t:Transaction)
            WHERE u.id = t.receiver_id
            MERGE (u)-[:RECEIVED]->(t)
        """)

        print("  Linking users → users (SENT — direct money flow)...")
        s.run("""
            MATCH (s:User), (r:User), (t:Transaction)
            WHERE s.id = t.sender_id AND r.id = t.receiver_id
            MERGE (s)-[:SENT {tx_id: t.id}]->(r)
        """)

        print("  Linking shared emails...")
        s.run("""
            MATCH (u:User)
            WITH u.email AS email, collect(u) AS users
            WHERE size(users) > 1
            UNWIND users AS a UNWIND users AS b
            WITH a, b WHERE a.id < b.id
            MERGE (a)-[:SHARED_EMAIL]->(b)
        """)

        print("  Linking shared phones...")
        s.run("""
            MATCH (u:User)
            WITH u.phone AS phone, collect(u) AS users
            WHERE size(users) > 1
            UNWIND users AS a UNWIND users AS b
            WITH a, b WHERE a.id < b.id
            MERGE (a)-[:SHARED_PHONE]->(b)
        """)

        print("  Linking shared addresses...")
        s.run("""
            MATCH (u:User)
            WITH u.address AS addr, collect(u) AS users
            WHERE size(users) > 1
            UNWIND users AS a UNWIND users AS b
            WITH a, b WHERE a.id < b.id
            MERGE (a)-[:SHARED_ADDRESS]->(b)
        """)

        print("  Linking shared payment methods...")
        s.run("""
            MATCH (u:User)
            WITH u.payment_method AS pay, collect(u) AS users
            WHERE size(users) > 1
            UNWIND users AS a UNWIND users AS b
            WITH a, b WHERE a.id < b.id
            MERGE (a)-[:SHARED_PAYMENT]->(b)
        """)

        print("  Linking same-IP transactions (TX→TX) — batched by IP value...")
        ip_result = s.run("""
            MATCH (t:Transaction)
            WITH t.ip_address AS ip, count(t) AS cnt
            WHERE cnt > 1
            RETURN ip
        """)
        shared_ips = [r["ip"] for r in ip_result]
        print(f"    Found {len(shared_ips)} shared IPs to link...")
        for ip in shared_ips:
            s.run("""
                MATCH (t:Transaction {ip_address: $ip})
                WITH collect(t) AS txs
                UNWIND txs AS a
                UNWIND txs AS b
                WITH a, b WHERE a.id < b.id
                MERGE (a)-[:SAME_IP]->(b)
            """, ip=ip)

        print("  Linking same-device transactions (TX→TX) — batched by device value...")
        dev_result = s.run("""
            MATCH (t:Transaction)
            WITH t.device_id AS device, count(t) AS cnt
            WHERE cnt > 1
            RETURN device
        """)
        shared_devices = [r["device"] for r in dev_result]
        print(f"    Found {len(shared_devices)} shared devices to link...")
        for device in shared_devices:
            s.run("""
                MATCH (t:Transaction {device_id: $device})
                WITH collect(t) AS txs
                UNWIND txs AS a
                UNWIND txs AS b
                WITH a, b WHERE a.id < b.id
                MERGE (a)-[:SAME_DEVICE]->(b)
            """, device=device)

    print(" All relationships created!")


# ── Run everything in order ──
if __name__ == "__main__":
    print(" Starting FRAML seed data generation...")
    print("   This will generate 510 users and 100,000 transactions.")
    print("   Estimated time: 5–10 minutes depending on machine speed.\n")

    create_indexes()       
    users = make_users(510)
    txs   = make_transactions(users, 100000)
    save_users(users)
    save_transactions(txs)
    create_relationships()
    driver.close()
    print("\n Database is ready! 510 users and 100,000 transactions loaded.")