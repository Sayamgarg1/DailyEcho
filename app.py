from flask import Flask, render_template, request, jsonify, redirect, session
import os
import sqlite3
from datetime import date
from werkzeug.security import generate_password_hash, check_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "templates"),
    static_folder=os.path.join(BASE_DIR, "static")
)

app.secret_key = "supersecretkey"

# ---------------- DATABASE ----------------

def get_db():
    conn = sqlite3.connect("dailyecho.db")
    conn.row_factory = sqlite3.Row
    return conn


def ensure_tables():
    db = get_db()
    cur = db.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS dailyecho (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            entry_date TEXT,
            content TEXT,
            mood TEXT,
            UNIQUE(user_id, entry_date)
        )
    """)

    db.commit()
    db.close()


ensure_tables()

# ---------------- AUTH ----------------

@app.route("/", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        db = get_db()
        cur = db.cursor()

        user = cur.execute(
            "SELECT * FROM users WHERE username=?",
            (request.form["username"],)
        ).fetchone()

        db.close()

        if user and check_password_hash(user["password"], request.form["password"]):
            session["user_id"] = user["id"]
            return redirect("/dailyecho")

        return "Invalid credentials"

    return render_template("login.html")


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        db = get_db()
        cur = db.cursor()

        cur.execute(
            "INSERT INTO users (username, password) VALUES (?, ?)",
            (
                request.form["username"],
                generate_password_hash(request.form["password"])
            )
        )

        db.commit()
        db.close()
        return redirect("/")

    return render_template("register.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect("/")


# ---------------- MAIN PAGE ----------------

@app.route("/dailyecho")
def dailyecho():
    if "user_id" not in session:
        return redirect("/")
    return render_template("index.html")


# ---------------- ENTRY ADD ----------------

@app.route("/add", methods=["POST"])
def add_entry():
    if "user_id" not in session:
        return jsonify({"error": "unauthorized"})

    data = request.json

    db = get_db()
    cur = db.cursor()

    cur.execute(
        "INSERT OR REPLACE INTO dailyecho (user_id, entry_date, content, mood) VALUES (?, ?, ?, ?)",
        (
            session["user_id"],
            date.today().isoformat(),
            data["content"],
            data["mood"]
        )
    )

    db.commit()
    db.close()

    return jsonify({"status": "saved"})


# ---------------- APIs ----------------

@app.route("/api/entry-by-date")
def entry_by_date():
    if "user_id" not in session:
        return jsonify(None)

    date_str = request.args.get("date")

    db = get_db()
    cur = db.cursor()

    row = cur.execute(
        "SELECT entry_date, content, mood FROM dailyecho WHERE user_id=? AND entry_date=?",
        (session["user_id"], date_str)
    ).fetchone()

    db.close()

    return jsonify(dict(row)) if row else jsonify(None)


@app.route("/api/calendar")
def calendar_api():
    if "user_id" not in session:
        return jsonify({})

    db = get_db()
    cur = db.cursor()

    rows = cur.execute(
        "SELECT entry_date, mood FROM dailyecho WHERE user_id=?",
        (session["user_id"],)
    ).fetchall()

    db.close()

    return jsonify({r["entry_date"]: r["mood"] for r in rows})


@app.route("/api/add-to-today", methods=["POST"])
def add_to_today():
    if "user_id" not in session:
        return jsonify({"error": "unauthorized"})

    new_text = request.json.get("content", "").strip()
    if not new_text:
        return jsonify({"status": "empty"})

    today = date.today().isoformat()

    db = get_db()
    cur = db.cursor()

    row = cur.execute(
        "SELECT content FROM dailyecho WHERE user_id=? AND entry_date=?",
        (session["user_id"], today)
    ).fetchone()

    if row:
        updated = row["content"] + "\n\n" + new_text
        cur.execute(
            "UPDATE dailyecho SET content=? WHERE user_id=? AND entry_date=?",
            (updated, session["user_id"], today)
        )
    else:
        cur.execute(
            "INSERT INTO dailyecho (user_id, entry_date, content, mood) VALUES (?, ?, ?, ?)",
            (session["user_id"], today, new_text, "normal")
        )

    db.commit()
    db.close()

    return jsonify({"status": "added"})


@app.route("/api/today-entry")
def today_entry():
    if "user_id" not in session:
        return jsonify("")

    today = date.today().isoformat()

    db = get_db()
    cur = db.cursor()

    row = cur.execute(
        "SELECT content FROM dailyecho WHERE user_id=? AND entry_date=?",
        (session["user_id"], today)
    ).fetchone()

    db.close()

    return jsonify(row["content"] if row else "")


@app.route("/api/search")
def search_api():
    if "user_id" not in session:
        return jsonify([])

    q = request.args.get("q", "").strip()

    db = get_db()
    cur = db.cursor()

    rows = cur.execute(
        """
        SELECT entry_date, content
        FROM dailyecho
        WHERE user_id = ?
          AND content LIKE ?
        ORDER BY entry_date DESC
        """,
        (session["user_id"], f"%{q}%")
    ).fetchall()

    db.close()

    return jsonify([dict(r) for r in rows])


@app.route("/api/mood-data")
def mood_data_api():
    if "user_id" not in session:
        return jsonify([])

    db = get_db()
    cur = db.cursor()

    rows = cur.execute(
        "SELECT entry_date, mood FROM dailyecho WHERE user_id=?",
        (session["user_id"],)
    ).fetchall()

    db.close()

    mood_score = {"sad": 1, "normal": 2, "happy": 3, "cheerful": 4}

    return jsonify([
        {"date": r["entry_date"], "score": mood_score.get(r["mood"], 0)}
        for r in rows
    ])


@app.route("/api/graph")
def graph_api():
    db = get_db()
    cur = db.cursor()

    rows = cur.execute(
        "SELECT entry_date, mood FROM dailyecho ORDER BY entry_date DESC LIMIT 7"
    ).fetchall()

    db.close()

    rows = rows[::-1]

    mood_map = {"sad": 1, "neutral": 2, "happy": 3, "cheerful": 4}

    return jsonify([
        {"date": r["entry_date"], "value": mood_map.get(r["mood"], 2)}
        for r in rows
    ])


# ---------------- RUN ----------------

if __name__ == "__main__":
    app.run(debug=True)
