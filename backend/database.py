from neo4j import GraphDatabase
import os

# These read the values from docker-compose.yml environment section
URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
USER = os.getenv("NEO4J_USER", "neo4j")
PASSWORD = os.getenv("NEO4J_PASSWORD", "password123")

# This creates ONE connection that the whole app shares
driver = GraphDatabase.driver(URI, auth=(USER, PASSWORD))

def get_session():
    # Every time we need to talk to database, we call this
    
    return driver.session()

def close_connection():
    driver.close()