const countdown = document.querySelector("#countdown");


const endTime = new Date("2026-07-14T16:05:00+02:00").getTime();

function updateCountdown() {
    const remaining = endTime - Date.now();

    if (remaining <= 0) {
        countdown.textContent = "00:00:00";
        return;
    }

    const totalSeconds = Math.floor(remaining / 1000);

    const days = Math.floor(totalSeconds / 86400);
const hours = Math.floor((totalSeconds % 86400) / 3600);
const minutes = Math.floor((totalSeconds % 3600) / 60);
const seconds = totalSeconds % 60;

    countdown.textContent =
        `${String(days).padStart(2, "0")}:` +
        `${String(hours).padStart(2, "0")}:` +
        `${String(minutes).padStart(2, "0")}:` +
        `${String(seconds).padStart(2, "0")}`;
}

updateCountdown();
setInterval(updateCountdown, 1000);