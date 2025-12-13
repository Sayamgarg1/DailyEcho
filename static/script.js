function isToday(y, m, d) {
    const t = new Date();
    return y === t.getFullYear() && m === t.getMonth() && d === t.getDate();
}

function viewEntryByDate(dateStr) {
    fetch("/api/entry-by-date?date=" + dateStr)
        .then(r => r.json())
        .then(data => {
            if (!data) {
                document.getElementById("viewDate").innerText = dateStr;
                document.getElementById("viewMood").innerText = "—";
                document.getElementById("viewContent").innerText = "No entry for this day.";
                return;
            }
            document.getElementById("viewDate").innerText = data.date;
            document.getElementById("viewMood").innerText = moodEmoji[data.mood] || data.mood;
            document.getElementById("viewContent").innerText = data.content;
        });
}


const moodEmoji = {
    happy: "😄",
    sad: "😢",
    normal: "🙂",
    cheerful: "🤩"
};

let currentDate = new Date();

function saveEntry() {
    fetch("/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            content: document.getElementById("entry").value,
            mood: document.getElementById("mood").value
        })
    })
    .then(() => {
        alert("Saved!");
        document.getElementById("entry").value = "";
        loadCalendar();
    });
}


function loadCalendar() {
    fetch("/api/calendar")
        .then(res => res.json())
        .then(data => renderCalendar(data));
}

function renderCalendar(data) {
    const cal = document.getElementById("calendar");
    const monthYear = document.getElementById("monthYear");
    cal.innerHTML = "";

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    monthYear.innerText = currentDate.toLocaleString("default", {
        month: "long",
        year: "numeric"
    });

    // Weekday headers
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    days.forEach(d => {
        cal.innerHTML += `<div class="calendar-header">${d}</div>`;
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Empty cells
    for (let i = 0; i < firstDay; i++) {
        cal.innerHTML += `<div class="calendar-day empty"></div>`;
    }

    // Actual days
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const mood = data[dateStr] || "";
        const todayClass = isToday(year, month, d) ? " today" : "";

        cal.innerHTML += `
            <div class="calendar-day${todayClass}" onclick="viewEntryByDate('${dateStr}')">
                <div class="date-number">${d}</div>
                <div class="mood-emoji">${moodEmoji[mood] || ""}</div>
            </div>
        `;
    }

}
function loadTodayEntry() {
    fetch("/api/today-entry")
        .then(r => r.json())
        .then(text => {
            document.getElementById("todayContent").innerText =
                text || "Nothing written today yet.";
        });
}
function searchEntry() {
    const q = document.getElementById("search").value.trim();
    if (!q) return;

    fetch("/api/search?q=" + encodeURIComponent(q))
        .then(res => res.json())
        .then(data => {
    const box = document.getElementById("searchResults");
    box.innerHTML = "";

    if (data.length === 0) {
        box.innerHTML = "<p>No results found.</p>";
    } else {
        data.forEach(item => {
    const highlighted = highlightWord(item.content, q);
    box.innerHTML += `
        <div class="search-item clickable"
             onclick="openDayFromSearch('${item.date}')">
            <p><strong>📅 ${item.date}</strong></p>
            <p>${highlighted}</p>
        </div>
        <hr>
    `;
});
}

    box.scrollIntoView({ behavior: "smooth" }); // 🔥 KEY LINE
});
}



function addToToday() {
    const text = document.getElementById("addMoreText").value;
    if (!text.trim()) return;

    fetch("/api/add-to-today", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text })
    })
    .then(() => {
        document.getElementById("addMoreText").value = "";
        refreshAll();  // 🔥 ONE CALL DOES EVERYTHING
    });
}



loadTodayEntry();


    


function prevMonth() {
    currentDate.setMonth(currentDate.getMonth() - 1);
    loadCalendar();
}

function nextMonth() {
    currentDate.setMonth(currentDate.getMonth() + 1);
    loadCalendar();
}

loadCalendar();

/* ===========================
   ⏰ REMINDER (NOTIFICATION)
=========================== */

function setReminder() {
    const time = document.getElementById("reminderTime").value;
    if (!time) return alert("Select time");

    localStorage.setItem("journalReminder", time);
    document.getElementById("reminderStatus").innerText =
        "Reminder set for " + time;
}

function checkReminder() {
    const time = localStorage.getItem("journalReminder");
    if (!time) return;

    const now = new Date();
    const current = now.toTimeString().slice(0, 5);

    if (current === time) {
        new Notification("📝 Time to write your journal!");
    }
}

if (Notification.permission !== "granted") {
    Notification.requestPermission();
}

setInterval(checkReminder, 60000);
let moodChart = null;

function drawGraph() {
  fetch("/api/graph")
    .then(res => res.json())
    .then(data => {

      if (!data.length) {
        return;
      }

      const labels = data.map(d => d.date);
      const values = data.map(d => d.value);

      const ctx = document.getElementById("moodChart").getContext("2d");

      if (moodChart) {
        moodChart.destroy();
      }

      moodChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: labels,
          datasets: [{
            label: "Mood Level",
            data: values,
            borderColor: "#4caf50",
            backgroundColor: "rgba(76, 175, 80, 0.2)",
            tension: 0.4,
            fill: true,
            pointBackgroundColor: values.map(v =>
              v === 1 ? "#f44336" :
              v === 2 ? "#ff9800" :
                        "#4caf50"
            ),
            pointRadius: 6
          }]
        },
        options: {
          responsive: true,
          scales: {
            y: {
              min: 1,
              max: 3,
              ticks: {
                stepSize: 1,
                callback: value => {
                  if (value === 1) return "Sad 😢";
                  if (value === 2) return "Neutral 😐";
                  if (value === 3) return "Happy 😊";
                }
              }
            }
          }
        }
      });
    });
}


function highlightWord(text, word) {
    const regex = new RegExp(`(${word})`, "gi");
    return text.replace(regex, "<mark>$1</mark>");
}
function refreshAll() {
    loadCalendar();
    loadTodayEntry();
    drawGraph();
    window.scrollTo({ top: 0, behavior: "smooth" });
}
function handleSearchInput() {
    const q = document.getElementById("search").value.trim();
    if (q === "") {
        document.getElementById("searchResults").innerHTML = "";
    }
}
function openDayFromSearch(dateStr) {
    // Clear search UI
    document.getElementById("search").value = "";
    document.getElementById("searchResults").innerHTML = "";

    // Load that day’s entry
    viewEntryByDate(dateStr);

    // Scroll to the day viewer section
    document.getElementById("dayViewer")
        .scrollIntoView({ behavior: "smooth" });
}
ctx.fillStyle = "#555";
ctx.fillText("Happy", 5, 40);
ctx.fillText("Neutral", 5, 90);
ctx.fillText("Sad", 5, 140);

drawGraph();
