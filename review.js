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
  if (post.published) {
    showMissingImage("Published Story", post.imageNote);
  } else if (post.image) {
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

  if (post.published) {
    card.querySelector("fieldset").remove();
    card.querySelector(".notes-label").remove();
    card.querySelector(".graphic-label").remove();
    return { post, card };
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

  const lineup = [["2026-11-27","A Wharf with no water","Story","Downtown Fact Friday","Why does Staunton have a Wharf with no waterfront?\n\nThe name comes from its history as a shipping point, not a waterfront. A little downtown history from Collins Market.","Vertical Story in production. Source: https://www.dhr.virginia.gov/historic-registers/132-0014/"],["2026-11-28","Small Business Saturday","Post","Holiday","Small Business Saturday is a good day to explore downtown. Make Collins Market part of your stroll.","Warm storefront image; no unconfirmed discounts or hours.","assets/nov-19-review-r5.jpg"],["2026-11-30","Christmas parade reminder","Post","Downtown event","Downtown Staunton's Christmas Parade starts at 7 p.m. tonight. See you downtown for Winter Magic!","Keep 2025 archive photo label. No competing This or That post today.","assets/nov-20-review-r5.jpg"],["2026-12-02","Storefront welcome","Story","Store","A little stop on your downtown stroll. What brings you into Collins Market today?","Use approved storefront Story.","assets/IMG_2063.jpg"],["2026-12-04","Hotel 24 South: Since 1924","Reel","Downtown Fact Friday","Imagine checking in here in 1924.\n\nWhat would you ask a hotel guest from back then? A little downtown history from Collins Market.","Confirm photo permission; final Reel needed. Hotel not yet featured.","assets/nov-14-branding-r4.jpg"],["2026-12-05","Downtown feature: Story share","Story","Downtown","Missed yesterday's Downtown Fact Friday? Take a look at Hotel 24 South through a little local history.","Reshare the approved hotel feature."],["2026-12-07","This or That: Calypso flavors","Post","Monday This or That","Paradise Punch or Grapeberry? Pick your Calypso side.\n\nTell us your choice below.","Confirm stock; use current warm design.","assets/calypso-paradise-grapeberry-screenshot.jpg"],["2026-12-09","A good cup downtown","Post","Shop","A good cup and a little downtown pause.\n\nWhat's your usual coffee order?","Confirm coffee offering; warm understated visual.","assets/IMG_2061.jpg"],["2026-12-10","Behind the counter","Story","Store","A little behind-the-counter moment at Collins Market.","Current store photo needed."],["2026-12-11","A Beverley Street detail","Post","Downtown Fact Friday","Topic to confirm: a downtown detail people pass every day. Final caption follows photo selection and fact-checking.","Choose a fresh subject and verify its story. Do not repeat Blackfriars or Clocktower."],["2026-12-14","This or That: sweet vs. salty","Post","Monday This or That","Something sweet or something salty?\n\nWhich side are you choosing today?","Rich to select and photograph two in-stock products."],["2026-12-16","Something sweet","Story","Shop","A little sweetness for your Wednesday. What's your go-to treat?","Confirm pictured treat is stocked.","assets/IMG_2070.jpg"],["2026-12-18","Your downtown holiday stop","Post","Store","Holiday errands call for a little pause.\n\nMake Collins Market part of your next downtown stroll.","Warm interior or window photograph needed."],["2026-12-21","This or That: holiday shopping fuel","Post","Monday This or That","A little fuel for your downtown shopping trip.\n\nWhich snack or drink would you pick?","Confirm two products; final caption will name the pair."],["2026-12-23","Holiday hours","Story","Holiday","Holiday hours will be added once confirmed.","Hold until Rich confirms exact hours. Do not publish placeholder."],["2026-12-24","Christmas greeting","Post","Holiday","Wishing our neighbors a peaceful Christmas Eve and a holiday filled with the people who matter most.\n\nWith love from Collins Market.","Subtle warm seasonal treatment; no hours claim."],["2026-12-25","Merry Christmas","Story","Holiday","Merry Christmas from Collins Market.\n\nWishing you a warm day with the people who matter most.","Simple greeting; Fact Friday pauses for Christmas."],["2026-12-28","This or That: your last pick of 2026","Post","Monday This or That","One last This or That for 2026.\n\nWhich one are you reaching for?","Two confirmed products needed."],["2026-12-30","A favorite store moment","Story","Store","One of our favorite little moments from this year.\n\nThanks for making Collins Market part of yours.","Choose a real store photo from this year."],["2026-12-31","Thank you, Staunton","Post","Holiday","Thank you, Staunton.\n\nTo everyone who stopped in, brought a friend, or made us part of their downtown routine: we're grateful.\n\nSee you in 2027.","Warm store photo and subtle thank-you typography."]];
  data.posts = lineup.map(([date,title,type,series,caption,note,image]) => ({
    id: 'cm-' + date, date, dateLabel: new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric',timeZone:'UTC'}).format(new Date(date)), title,type,series,caption,platform:'Facebook + Instagram',image:image || '',imageNote:(image ? 'Existing preview. ' : 'Graphic needed. ') + note,placeholders:[note],graphicNeeded:!image,existing:false
  }));
  Object.assign(data.posts[0], {published:true,graphicNeeded:false,placeholders:[],title:"The Wharf with no water? · Published",caption:"Final v5 video with embedded narration and captions. Published to Facebook and Instagram Stories on November 27.",imageNote:"Published November 27: Facebook at 1:45 p.m. and Instagram at 1:46 p.m. Eastern. Stories only.",existing:true,existingNote:"Completed. Included for reference; no new approval is needed."});
  data.posts[0].sources = [{label:'Watch the final Wharf video (v5)',url:'https://drive.google.com/file/d/1Q43W8leymZKbnm9j2f5eKH2-g_3hDK4X/view'},{label:'Virginia DHR: Wharf Area Historic District',url:'https://www.dhr.virginia.gov/historic-registers/132-0014/'}];
  data.intro = 'Hi Rich! Thanksgiving and the Wharf Downtown Fact Friday Story are already posted. The completed Wharf video is included below for reference. Upcoming review begins with Small Business Saturday and the parade reminder. December includes 10 feed posts/Reels and 7 Stories. Please review the concepts and captions below. Final artwork is still needed where noted.';
  document.querySelector('.subtitle').textContent = 'November 27 through December 31, 2026';
  document.querySelector('.publication-note').textContent = 'Review only. Nothing publishes automatically. Concept approval is separate from final artwork and release approval. December 11 remains a topic to confirm.';
  document.querySelector('button[type="submit"]').textContent = 'Create review summary';
  const overview = document.createElement('section');
  overview.className = 'details panel';
  const heading = document.createElement('h2');
  heading.textContent = 'The December direction';
  const detail = document.createElement('p');
  detail.textContent = 'Warm store photography, downtown history and product comparisons. Hotel 24 South is December 4. Please confirm products for December 14, 21 and 28, holiday hours, and photo permissions. Blackfriars has already been covered. The Pet Grand Marshal and Wilson birthday concepts are removed.';
  overview.append(heading,detail);
  byId('posts').before(overview);
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
    if (!post.published) reviews.push(review);
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
