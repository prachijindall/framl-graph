from pydantic import BaseModel
from typing import Optional

# This is what a User must look like
class User(BaseModel):
    id: str                  # e.g. "U-00001"
    name: str                # e.g. "Alice Smith"
    email: str               # e.g. "alice@email.com"
    phone: str               # e.g. "+1-555-0147"
    address: str             # e.g. "123 Main St, NYC"
    payment_method: str      # e.g. "visa_4242"

# This is what a Transaction must look like
class Transaction(BaseModel):
    id: str                  # e.g. "TX-000001"
    sender_id: str           # must match a User id
    receiver_id: str         # must match a User id
    amount: float            # e.g. 4200.00
    currency: str = "INR"   # default is INR
    timestamp: str           # e.g. "2024-01-15T10:30:00"
    ip_address: str          # e.g. "192.168.1.44"
    device_id: str           # e.g. "d8f3a91b"
    status: str = "clear"    # clear / review / flagged
    risk_score: float = 0.0  # 0.0 to 1.0