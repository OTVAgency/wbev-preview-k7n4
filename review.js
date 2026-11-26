"use strict";

const byId = (id) => document.getElementById(id);
const decisions = ["Approve", "Reject", "Request changes"];
const mailtoLimit = 1800;
let downloadUrl;

function renderPost(post) {
  const card = byId("post-template").content.firstElementChild.cloneNode(true);
  card.id = post.id;
  const heading = card.querySelector("h3");
  heading.id = post.id + "-title";
  heading.textContent = post.title;
  card.setAttribute("aria-labelledby", heading.id);
  const date = card.querySelector("time");
  date.dateTime = post.date;
  date.textContent = post.dateLabel;
  card.querySelector(".metadata").textContent = [post.type, post.platform, post.series].filter(Boolean).join(" · ");

  const preview = card.querySelector(".preview");
  const image = preview.querySelector("img");
  const imageMat = preview.querySelector(".image-mat");
  const description = preview.querySelector("figcaption");
  function showMissingImage(label, note) {
    imageMat.hidden = true;
    preview.classList.add("missing");
    const title = document.createElement("strong");
    title.textContent = label;
    description.replaceChildren(title, note);
  }
  if (post.image) {
    image.alt = post.title + (post.graphicNeeded ? " draft mockup" : " visual preview");
    image.addEventListener("error", () => showMissingImage("Preview unavailable", post.imageNote));
    image.src = post.image;
    description.textContent = post.imageNote.replace(/^Graphic needed\.\s*/, "");
  } else {
    showMissingImage("Graphic needed", post.imageNote.replace(/^Graphic needed\.\s*/, ""));
  }

  card.querySelector(".caption").textContent = post.caption;
  for (const source of post.sources || []) {
    const link = document.createElement("a");
    link.href = source.url;
    link.textContent = source.label;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const line = document.createElement("p");
    line.append(link);
    card.querySelector(".post-content").append(line);
  }
  if (post.existing) {
    const calendarNote = card.querySelector(".calendar-note");
    calendarNote.textContent = post.existingNote;
    calendarNote.hidden = false;
  }
  if (post.placeholders.length) {
    const confirm = card.querySelector(".confirm");
    for (const placeholder of post.placeholders) {
      const item = document.createElement("li");
      item.textContent = placeholder;
      confirm.querySelector("ul").append(item);
    }
    confirm.hidden = false;
  }

  const choices = card.querySelector(".choices");
  const error = card.querySelector(".error");
  error.id = post.id + "-error";
  const notesLabel = card.querySelector(".notes-label span");
  const notes = card.querySelector(".notes");
  notes.setAttribute("aria-describedby", error.id);
  const radios = decisions.map((decision) => {
    const label = document.createElement("label");
    label.className = "choice";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = post.id;
    radio.value = decision;
    radio.required = true;
    radio.setAttribute("aria-describedby", error.id);
    const text = document.createElement("span");
    text.textContent = decision;
    label.append(radio, text);
    choices.append(label);
    return radio;
  });
  const graphic = card.querySelector(".graphic");
  if (post.graphicNeeded) {
    graphic.value = post.imageNote;
    graphic.closest("label").hidden = false;
  }
  const review = {
    post, card, radios, error, notes, graphic,
    decision: () => radios.find((radio) => radio.checked)?.value
  };
  choices.addEventListener("change", () => {
    notes.required = review.decision() === "Request changes";
    notesLabel.textContent = notes.required ? "What should change? (required)" : "Notes (optional)";
    clearError(review);
  });
  notes.addEventListener("input", () => {
    if (notes.value.trim()) clearError(review);
  });
  return review;
}

function clearError({ error, radios, notes }) {
  error.hidden = true;
  error.textContent = "";
  for (const input of [...radios, notes]) input.removeAttribute("aria-invalid");
}

function validate(reviews) {
  for (const review of reviews) {
    clearError(review);
    const { card, decision, radios, notes, error } = review;
    const selection = decision();
    if (selection && (selection !== "Request changes" || notes.value.trim())) continue;

    error.hidden = false;
    error.textContent = selection ? "Add a note describing the changes for this draft." :
      "Choose Approve, Reject, or Request changes for this draft.";
    const input = selection ? notes : radios[0];
    input.setAttribute("aria-invalid", "true");
    input.focus();
    // Keep the focused control visible below the sticky progress bar.
    const barHeight = document.querySelector(".review-bar").offsetHeight;
    if (input.getBoundingClientRect().top < barHeight + 12) {
      input.scrollIntoView({ block: "center" });
    }
    return false;
  }
  return true;
}

function makeSummary(reviews) {
  const header = [
    "Collins Market post review",
    "Name: " + (byId("name").value.trim() || "Not provided"),
    "Email or phone: " + (byId("contact").value.trim() || "Not provided"),
    "Upcoming downtown events: " + (byId("events").value.trim() || "None provided")
  ];
  const entries = reviews.map(({ post, decision, notes, graphic }) => {
    const lines = [post.dateLabel + ", " + post.date.slice(0, 4) + " | " + post.title, "Decision: " + decision()];
    if (notes.value.trim()) lines.push("Notes: " + notes.value.trim());
    if (post.graphicNeeded && graphic.value.trim()) lines.push("Graphic request: " + graphic.value.trim());
    return lines.join("\n");
  });
  return [header.join("\n"), ...entries].join("\n\n") + "\n";
}

function showSummary(summary, email) {
  const prefix = "mailto:" + email + "?subject=" + encodeURIComponent("Collins Market post review") + "&body=";
  const fullDraft = prefix + encodeURIComponent(summary.replaceAll("\n", "\r\n"));
  const emailDraft = byId("email-draft");
  emailDraft.href = fullDraft.length <= mailtoLimit ? fullDraft : prefix + encodeURIComponent(
    "Hi Cory,\r\n\r\nThe full Collins Market review summary is in my clipboard or downloaded text file. I'll paste it here or attach the file before sending."
  );

  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = URL.createObjectURL(new Blob([summary], { type: "text/plain;charset=utf-8" }));
  byId("download").href = downloadUrl;
  byId("summary").value = summary;
  byId("result").hidden = false;
  byId("result-heading").focus();

  const delivery = byId("delivery");
  const emailStatus = "Your review has not been sent. Use Open email draft, then paste the full summary or attach the downloaded file and send it to Cory.";
  const fallback = " You can select the full text below or download it.";
  delivery.textContent = emailStatus + fallback;
  // Start the copy and launch the draft during the original submit gesture.
  navigator.clipboard?.writeText(summary).then(() => {
    delivery.textContent = emailStatus + " The full summary was copied to your clipboard.";
  }).catch(() => {
    delivery.textContent = emailStatus + fallback;
  });
  // Let the reviewer explicitly open and send the email draft.
}

async function init() {
  const response = await fetch("posts.json");
  if (!response.ok) throw new Error("Drafts could not load.");
  const data = await response.json();
  data.posts = data.posts.filter(post => post.date >= "2026-11-27");
  document.querySelector(".subtitle").textContent = "November 27 through December 31, 2026";
  data.intro = "Hi Rich! Thanksgiving is already posted, so we start with Downtown Fact Friday on November 27. This review covers 5 remaining November drafts and 17 December drafts: 10 feed posts/Reels and 7 Stories. Approve the direction or leave changes below. Placeholder images and unfinished Reels still need final production before scheduling.";
  document.querySelector(".publication-note").textContent = "Review only. Nothing here publishes automatically. Approval of a concept does not approve unfinished artwork. Cory will finalize the assets and confirm stock and hours before scheduling.";
  document.querySelector('button[type="submit"]').textContent = "Create review summary";
  const first = data.posts[0];
  first.existingNote = "First up: Friday, November 27, proposed 11 a.m. ET. SDDA confirms the first Pet Grand Marshal and the November 30 parade at 7 p.m. Final Reel production is still needed.";
  first.placeholders = ["Approve the concept and caption. OTV still needs to finish the Reel; this image is a preview."];
  first.sources = [{label:"SDDA: Pet Grand Marshal",url:"https://www.stauntondowntown.org/pet-contest"},{label:"SDDA: parade details",url:"https://www.stauntondowntown.org/downtown-staunton-christmas-parade-2026"}];
  const parade = data.posts.find(post => post.id === "nov30-winter-magic-post");
  parade.placeholders = [];
  parade.sources = [first.sources[1]];
  for (const post of data.posts) {
    for (const key of ["imageNote", "existingNote"]) if (post[key]) post[key] = post[key].replaceAll(" — ", ": ");
    if (post.caption.includes("[Item A]")) {
      post.imageNote = "Layout reference only. Please name and photograph two in-stock products for this date. OTV will prepare the final graphic and caption in the current warm Collins Market style.";
      post.placeholders = ["Add both product names in Notes and send a current photo. The pictured Calypso pair is only a layout example."];
    }
    if (post.id === "dec24-christmas-post") {
      post.caption = "Christmas Eve downtown has its own quiet charm.\n\nWishing our neighbors a peaceful evening and a holiday filled with the people who matter most.\n\n#CollinsMarket #DowntownStaunton #StauntonVA";
      post.placeholders = ["Confirm December 24 hours separately if you want an hours announcement. This greeting makes no opening-hours claim."];
    }
    if (post.id === "dec31-nye-post") {
      post.caption = post.caption.replace(" [Confirm December 31 hours.]", "");
      post.placeholders = ["Confirm December 31 and January 1 hours separately if you would like them announced."];
    }
    if (post.id === "dec25-christmas-story") {
      post.existing = true;
      post.existingNote = "The Christmas greeting takes the Friday slot this week. Downtown Fact Friday pauses for the holiday.";
    }
  }
  const overview = document.createElement("section");
  overview.className = "details panel";
  const overviewTitle = document.createElement("h2");
  overviewTitle.textContent = "To finish December";
  const overviewText = document.createElement("p");
  overviewText.textContent = "Please send product pairs for December 14, 21 and 28; current store or seasonal photos for the placeholder cards; and the Wharf and Woodrow Wilson Birthplace photos. Confirm permission for the hotel photo. OTV will finish the graphics and Reels. Holiday hours can be added separately once confirmed.";
  overview.append(overviewTitle, overviewText);
  byId("posts").before(overview);
  byId("intro").textContent = data.intro.split(" Nothing on this page gets published.")[0];
  const posts = byId("posts");
  const reviews = [];
  let monthKey;
  let section;
  for (const post of data.posts) {
    const key = post.date.slice(0, 7);
    if (key !== monthKey) {
      monthKey = key;
      section = document.createElement("section");
      const heading = document.createElement("h2");
      heading.id = "month-" + key;
      heading.className = "month-heading";
      heading.textContent = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" })
        .format(new Date(post.date));
      section.setAttribute("aria-labelledby", heading.id);
      section.append(heading);
      posts.append(section);
    }
    const review = renderPost(post);
    reviews.push(review);
    section.append(review.card);
  }

  const form = byId("review");
  const progress = byId("progress");
  progress.max = reviews.length;
  function updateCount() {
    const total = reviews.filter(({ decision }) => decision()).length;
    progress.value = total;
    byId("count").textContent = total + " of " + reviews.length + " reviewed";
  }
  posts.addEventListener("change", (event) => {
    if (event.target.type === "radio") updateCount();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (validate(reviews)) showSummary(makeSummary(reviews), data.submitEmail);
  });
  updateCount();
  form.hidden = false;
}

init().catch(() => {
  byId("count").textContent = "Drafts unavailable";
  const message = byId("load-error");
  message.textContent = "The drafts could not load. Open this page on a static server and refresh.";
  message.hidden = false;
});
