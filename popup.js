let p = "INSERT_HERE";

let compiled = "STYLE_HERE";
let s = document.createElement("style");
s.innerHTML = compiled;
document.body.appendChild(s);

let i = document.createElement("div");
i.id = "info_btn";
i.innerText = "i";
document.body.appendChild(i);

let tag = (k = (j) => j, o = (j) => j) => {
  return (old, ...int) => {
    let n = [];
    int.push("");
    for (let i = 0; i < old.length; i++) {
      n.push(o(old[i]), k(int[i]));
    }
    return n.join("");
  };
};

i.onclick = () => {
  let a = document.createElement("div");
  a.id = "popout";
  a.innerHTML = tag((a) => {
    try {
      JSON.parse(a);
      return a;
    } catch (_) {
      return a
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }
  })`
  <div id="close">x</div>
  <span id="projectId">${p.id}</span>
  <img class="bannerImg" src=${JSON.stringify("BANNER_IMAGE")}/>
  <h2 class="title"><img class="avatar" src=${JSON.stringify(
    "AUTHOR_IMAGE"
  )}/> ${p.title}</h2>
  <div class="stats">
    👁️‍🗨️ ${p.stats.views} ❤️ ${p.stats.loves} ⭐ ${p.stats.favorites}
  </div>
  <h5>Instructions</h5>
  <textarea readonly style="font-family: sans-serif !important; min-height: 200px;" class="instructions">${
    p.instructions || "No instructions"
  }</textarea>
  <h5>Description</h5>
  <textarea readonly style="font-family: sans-serif !important; min-height: 200px;" class="description">${
    p.description || "No description"
  }</textarea>
  `;
  document.body.appendChild(a);

  a.querySelector("#close").onclick = () => {
    a.remove();
  };
};
