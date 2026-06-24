"""Standalone Supabase Postgres connection for the sync container.

Reads the same DB env vars the bot/scheduler use (user/password/host/port/dbname)
so it needs no dependency on the old root Whatsapp_Scheduler module.
"""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()


def get_conn():
    return psycopg2.connect(
        user=os.getenv("user"),
        password=os.getenv("password"),
        host=os.getenv("host"),
        port=os.getenv("port"),
        dbname=os.getenv("dbname"),
        sslmode="require",
        connect_timeout=int(os.getenv("DB_CONNECT_TIMEOUT", "10")),
    )
