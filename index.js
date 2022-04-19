const fs = require("fs");
const fetch = require("cross-fetch");
require("colors");
const inquirer = require("inquirer");
const { join } = require("path");
const Packager = require("@turbowarp/packager");
const dataURL = require("image-data-uri");

(async () => {
  const popupScript = fs.readFileSync("./popup.js", "utf-8");
  const CUSTOM_STYLE = fs.readFileSync("./css.css", "utf-8");
  const FAKE_WAIT_TIME = 200;
  const SANITIZE_RE = /[/\\?%*:|"<>]/g;
  console.clear();
  const { default: logUpdate } = await import("log-update");
  log = throttle(trycatch(log), 100);
  const CURRENT = {
    logInterval: null,
    status: "Waiting for user input",
    projects: {},
  };
  const _slist = {
    id: "A single project from an ID",
    studio: "From a studio",
    user: "From a user's projects",
  };
  let source = await inquirer.prompt([
    {
      name: "source",
      message: "Where do you want to download projects from?",
      type: "list",
      choices: Object.values(_slist),
      default: _slist.user,
    },
  ]);
  source = Object.entries(_slist).find(([key, val]) => val == source.source)[0];

  const sources = {
    user: [
      {
        type: "input",
        name: "user",
        message: "What user's projects would you like to download?",
        default: "griffpatch",
        validate: async (id) => {
          await new Promise((r) => setTimeout(r, FAKE_WAIT_TIME));
          let { code, message } = await fetch(
            `https://api.scratch.mit.edu/users/${encodeURIComponent(id)}`
          ).then((r) => r.json());
          if (code) {
            return "User not found";
          } else {
            return true;
          }
        },
        filter: (a) => {
          if (a.startsWith("http")) {
            return a.split("/")[4];
          } else {
            return a;
          }
        },
        validatingText: "Checking if user exists",
      },
      {
        type: "number",
        name: "limit",
        message: "What number of projects should be maximum?",
        validate: (a) => {
          if (a < 1) {
            return "Invalid number";
          } else if (a > 1000) {
            return "Too big lol";
          } else {
            return true;
          }
        },
        default: 100,
      },
    ],
    studio: [
      {
        type: "string",
        name: "id",
        message:
          "What is the studio ID of the studio you want to download projects from?",
        default: "25020410",
        validate: async (id) => {
          await new Promise((r) => setTimeout(r, FAKE_WAIT_TIME));
          let { code, title } = await fetch(
            `https://api.scratch.mit.edu/studios/${encodeURIComponent(id)}`
          ).then((r) => r.json());
          if (code) {
            return "Studio not found";
          } else {
            CURRENT.folderTitle = title.replace(SANITIZE_RE, "-");
            return true;
          }
        },
        filter: (a) => {
          if (a.startsWith("http")) {
            return a.split("/")[4];
          } else {
            return a;
          }
        },
        validatingText: "Checking if studio exists",
      },
      {
        type: "number",
        name: "limit",
        message: "What number of projects should be maximum?",
        default: 100,
      },
    ],
    id: [
      {
        type: "string",
        name: "id",
        default: 60917032,
        message: "What's the project ID of the project?",
        validate: async (id) => {
          await new Promise((r) => setTimeout(r, FAKE_WAIT_TIME));
          let res = await fetch(
            `https://api.scratch.mit.edu/projects/${encodeURIComponent(id)}`
          ).then((r) => r.json());
          let { code, title } = res;
          if (code) {
            return "Project not found";
          } else {
            CURRENT.folderTitle = title.replace(SANITIZE_RE, "-");
            CURRENT.project = res;
            return true;
          }
        },
        validatingText: "Checking if project exists",
      },
    ],
  };
  const sort = {
    dateAsc: "Newest to oldest",
    dateDsc: "Oldest to newest",
    loves: "Loves",
    favorites: "Favorites",
    views: "Views",
    remixes: "Remixes",
    modified: "Modified date",
  };
  const sourceOptions = await inquirer.prompt([
    ...sources[source],
    ...(source === "id"
      ? []
      : [
          {
            type: "number",
            name: "limit",
            default: 100,
            message: "Project limit",
          },
        ]),
    {
      type: "list",
      name: "sort",
      message:
        "How to sort projects (this will affect which projects get downloaded if cut off by max length)",
      choices: Object.values(sort),
      default: sort.dateAsc,
    },
    {
      name: "target",
      message: "What output format do you want?",
      type: "list",
      choices: ["zip", "html"],
      default: "html",
    },
  ]);
  sourceOptions.limit = sourceOptions.limit || 100;
  const features = {
    label: "!Behavior features:",
    turbo: "Turbo mode",
    autoplay: "Autoplay",
    label1: "!Turbowarp added features:",
    highQualityPen: "High quality pen?",
    fencing: "Fence sprites?",
    miscLimits: "Miscellaneous limits",
    loadingBar: "Show loading progress",
    interpolation: "Interpolation",
    label2: "!Dangerous to turn off: ",
    compilerEnable: "Enable compiler",
  };
  const buttons = {
    greenFlag: "Green flag",
    stopAll: "Stop all",
    fullscreen: "Fullscreen",
    pause: "Pause",
  };

  let projectPrompt = [
    {
      type: "input",
      name: "folder",
      message: "Folder to save projects in (will be created if non-existant)",
      default: CURRENT.folderTitle || sourceOptions.user || "projects",
    },
    {
      type: "number",
      name: "framerate",
      message: "What frame rate should the project(s) run at? ",
      default: 30,
    },
    {
      name: "stageWidth",
      message: "Stage width",
      default: 480,
      type: "number",
    },
    {
      name: "stageHeight",
      message: "Stage height",
      default: 360,
      type: "number",
    },
    {
      name: "username",
      message: "Username",
      default: "player##",
    },
    {
      name: "maxClones",
      message: "Maximum clones",
      default: 1000,
      type: "number",
    },
    {
      type: "checkbox",
      name: "features",
      message: "What do you want enabled?",
      loop: false,
      choices: Object.values(features).map((i) =>
        i.startsWith("!") ? new inquirer.Separator(`= ${i.slice(1)} =`) : i
      ),
      default: [
        features.compilerEnable,
        features.loadingBar,
        features.fencing,
        features.interpolation,
        features.miscLimits,
        features.autoplay,
        features.highQualityPen,
      ],
    },
    {
      type: "checkbox",
      name: "buttons",
      message: "What buttons do you want to enable?",
      loop: false,
      choices: Object.values(buttons),
      default: [buttons.pause, buttons.fullscreen],
    },
  ];
  const { customize } = await inquirer.prompt([
    {
      name: "customize",
      message: "Customize the default settings?",
      type: "confirm",
      default: false,
    },
  ]);

  const projectOptions = customize
    ? await inquirer.prompt(projectPrompt)
    : Object.fromEntries(projectPrompt.map((i) => [i.name, i.default]));

  const opts = { source, sourceOptions, projectOptions };
  console.clear();
  CURRENT.logInterval = setInterval(log, 50);
  CURRENT.status = "Fetching projects";
  log();
  let projects = await (async () => {
    if (opts.source === "id") {
      return [
        CURRENT.project ||
          (await fetch(
            `https://api.scratch.mit.edu/projects/${opts.sourceOptions.id}`
          ).then((res) => res.json())),
      ];
    } else {
      let out = [];
      let current = { length: 20 };
      let i = 0;
      let LIMIT = Infinity;
      if (opts.sourceOptions.sort === sort.dateAsc) {
        // If it's not date ascending we have to get all the projects then sort
        LIMIT = opts.sourceOptions.limit;
      }
      while (current.length >= 20 && out.length < LIMIT) {
        CURRENT.status = `Getting page ${i}` /*.brightBlue*/;
        let url = {
          user: () => `users/${opts.sourceOptions.user}/projects?`,
          studio: () => `studios/${opts.sourceOptions.id}/projects/?limit=20&`,
          id: () => `projects/${opts.sourceOptions.id}`,
        };
        current = await fetch(
          `https://api.scratch.mit.edu/${url[opts.source]()}offset=${20 * i++}`
        ).then((res) => res.json());
        out.push(...current);
      }
      out = sortBy(
        out,
        (item) => {
          let s = opts.sourceOptions.sort;
          if (s === sort.dateDsc) {
            return new Date(item.history.created).getTime();
          }
          if (s === sort.modified) {
            return new Date(item.history.modified).getTime();
          }
          if (s === sort.favorites) {
            return item.stats.favorites;
          }
          if (s === sort.loves) {
            return item.stats.loves;
          }
          if (s === sort.views) {
            return item.stats.views;
          }
          if (s === sort.remixes) {
            return item.stats.remixes;
          }
        },
        true
      );
      return out.slice(0, opts.sourceOptions.limit);
    }
  })();
  CURRENT.projects = Object.fromEntries(
    projects.map((i) => [i.id, "Fetching".brightBlue])
  );
  log();
  let folder = opts.projectOptions.folder.replace(/\/$/, "");
  CURRENT.status = "Creating folder";
  log();
  fs.mkdirSync(folder, { recursive: true });
  CURRENT.status = "Getting projects";
  log();
  let projectPromises = [];
  for (let i in projects) {
    projectPromises.push(
      (async () => {
        let project = projects[i];
        CURRENT.projects[project.id] = "Fetching".yellow;
        let ab = await (
          await fetch(`https://projects.scratch.mit.edu/${project.id}`)
        ).arrayBuffer();
        let formattedTitle = project.title.replace(SANITIZE_RE, "-");
        const name = join(folder, formattedTitle);
        if (fs.existsSync(name)) {
          CURRENT.projects[project.id] =
            `File already exists (${project.title.brightBlue})`.brightYellow;
          log();
        }
        CURRENT.projects[project.id] = "Loading project".brightBlue;
        log();
        let loaded = await Packager.loadProject(ab, (type, a, b) => {
          CURRENT.projects[project.id] = `${`[${type}]`.yellow} ${
            typeof a === "string"
              ? a
              : a <= 1
              ? `${~~(a * 100)}%`.brightGreen
              : `${a} assets downloaded`.brightBlue
          }`;
        });
        CURRENT.projects[project.id] = "Packaging".brightBlue;
        log();
        const packager = new Packager.Packager(loaded);
        let f = Object.fromEntries(
          Object.entries(features).map(([k, v]) => [
            k,
            projectOptions.features.includes(v),
          ])
        );
        let btns = Object.fromEntries(
          Object.entries(buttons).map(([k, v]) => [
            k,
            { enabled: projectOptions.buttons.includes(v) },
          ])
        );
        f = {
          loadingScreen: {
            progressBar: f.loadingBar,
            text: project.title,
          },
          compiler: {
            enabled: f.compilerEnable,
          },
          ...f,
          target: sourceOptions.target,
          ...projectOptions,
          app: {
            icon: null,
            packageName: formattedTitle,
            windowTitle: formattedTitle,
            windowMode: "window",
          },
          controls: {
            ...btns,
          },
          custom: {
            js: popupScript
              .replace('"INSERT_HERE"', JSON.stringify(project))
              .replace('"STYLE_HERE"', JSON.stringify(CUSTOM_STYLE))
              .replace(
                '"BANNER_IMAGE"',
                JSON.stringify(
                  await dataURL.encodeFromURL(project.images["200x200"])
                )
              )
              .replace(
                '"AUTHOR_IMAGE"',
                JSON.stringify(
                  await dataURL.encodeFromURL(
                    project.author.profile.images["50x50"]
                  )
                )
              ),
          },
        };
        Object.assign(packager.options, f);
        packager.project = loaded;
        const { type, data } = await packager.package();
        if (data instanceof ArrayBuffer) {
          data = new Uint8Array(data);
        }
        CURRENT.projects[project.id] = "Writing file".green;
        log();
        fs.writeFileSync(`${name}.${type.split("/")[1]}`, data);
        CURRENT.projects[project.id] = "Finished".green;
        log();
      })()
    );
  }

  Promise.all(projectPromises).then(
    (p) => (
      (projects = p),
      (CURRENT.status = "Finished"),
      logUpdate(`✅ ${`Finished`.green}`),
      process.exit(0)
    )
  );

  function log() {
    // Change every 10 seconds
    const SPINNER_INDEX = ~~(Date.now() / 10000);
    let spinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let earthSpinner = ["🌍 ", "🌎 ", "🌏 "]
      .map((i) => new Array(4).fill(i))
      .flat();
    let dotsSpinner2 = ["⢄", "⢂", "⢁", "⡁", "⡈", "⡐", "⡠"];
    let runnerSpinner = ["🚶 ", "🏃 "].map((i) => new Array(4).fill(i)).flat();
    let weatherSpinner = [
      "☀️ ",
      "☀️ ",
      "☀️ ",
      "🌤 ",
      "⛅️ ",
      "🌥 ",
      "☁️ ",
      "🌧 ",
      "🌨 ",
      "🌧 ",
      "🌨 ",
      "🌧 ",
      "🌨 ",
      "⛈ ",
      "🌨 ",
      "🌧 ",
      "🌨 ",
      "☁️ ",
      "🌥 ",
      "⛅️ ",
      "🌤 ",
      "☀️ ",
      "☀️ ",
    ]
      .map((i) => new Array(2).fill(i))
      .flat();
    let arrowSpinner = ["⬆️ ", "↗️ ", "➡️ ", "↘️ ", "⬇️ ", "↙️ ", "⬅️ ", "↖️ "];
    let clockSpinner = [
      "🕛 ",
      "🕐 ",
      "🕑 ",
      "🕒 ",
      "🕓 ",
      "🕔 ",
      "🕕 ",
      "🕖 ",
      "🕗 ",
      "🕘 ",
      "🕙 ",
      "🕚 ",
    ];

    let spinners = [
      spinner,
      weatherSpinner,
      arrowSpinner,
      clockSpinner,
      earthSpinner,
      runnerSpinner,
      dotsSpinner2,
    ];
    spinner = spinners[SPINNER_INDEX % spinners.length];
    spinner = `${spinner[Math.floor(Date.now() / 50) % spinner.length]}`;
    if (Object.entries(CURRENT.projects).length) {
      const AMT = `[${
        Object.values(CURRENT.projects).filter((i) => i.includes("Finished"))
          .length
      }/${Object.keys(CURRENT.projects).length}]`.brightBlue;
      CURRENT.status = `Downloading projects `.yellow + AMT;
    }
    const HTMLIFIER = `
    █░█ ▀█▀ █▀▄▀█ █░░ █ █▀▀ █ █▀▀ █▀█
    █▀█ ░█░ █░▀░█ █▄▄ █ █▀░ █ ██▄ █▀▄`
      .split("\n")
      .map((i) => i.trim())
      .join("\n");
    let logThis = `\n\n${HTMLIFIER}\n\n\n${spinner} ${CURRENT.status}`.yellow;
    logThis = logThis;

    if (Object.entries(CURRENT.projects).length) {
      logThis += "\n\n";
      function STAT(p) {
        if (!p) {
          return "";
        }
        // Return something like "❤️ 100k"
        let s = opts.sourceOptions.sort;
        let emojis = {
          loves: "❤️",
          favorites: "⭐",
          views: "👁️‍🗨️",
          remixes: "🌀",
        };
        let key = Object.entries(sort).find((i) => i[1] === s)[0];
        if (!p.stats[key]) {
          return "";
        }
        return `${emojis[key]}  ${nFormatter(p.stats[key], 2)}`;
        function nFormatter(num, digits) {
          const lookup = [
            { value: 1, symbol: "" },
            { value: 1e3, symbol: "k" },
            { value: 1e6, symbol: "M" },
            { value: 1e9, symbol: "G" },
            { value: 1e12, symbol: "T" },
            { value: 1e15, symbol: "P" },
            { value: 1e18, symbol: "E" },
          ];
          const rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
          var item = lookup
            .slice()
            .reverse()
            .find(function (item) {
              return num >= item.value;
            });
          return item
            ? (num / item.value).toFixed(digits).replace(rx, "$1") + item.symbol
            : "0";
        }
      }
      let newlog = Object.entries(CURRENT.projects)
        .sort((a, b) => {
          // Get IDs
          a = a[0];
          b = b[0];
          a = projects.find((i) => i.id == a).title;
          b = projects.find((i) => i.id == b).title;
          // Alphabetically
          return a.localeCompare(b);
        })
        .filter(
          (i) =>
            !i[1].includes("Fetching") &&
            !i[1].includes("0%") &&
            !i[1].includes("Finished")
        )
        .slice(0, 10)
        .map(
          ([k, v]) =>
            `${
              `[${niceslice(
                projects.find((i) => i.id == k).title.trim()
              )} ${STAT(projects.find((i) => i.id == k))}]`.padEnd(45, " ")
                .yellow
            }    ${v}`
        )
        .join("\n");
      if (newlog.trim().length) {
        logThis += newlog;
      } else {
        logThis += `\nNo projects currently downloading`.yellow;
      }
    }

    logUpdate(logThis);
  }
})();

function trycatch(fn) {
  return (...a) => {
    try {
      fn(...a);
    } catch (e) {
      console.clear();
      console.error(e);
      process.exit(1);
    }
  };
}
function throttle(callback, limit) {
  var waiting = false; // Initially, we're not waiting
  return function () {
    // We return a throttled function
    if (!waiting) {
      // If we're not waiting
      callback.apply(this, arguments); // Execute users function
      waiting = true; // Prevent future invocations
      setTimeout(function () {
        // After a period of time
        waiting = false; // And allow future invocations
      }, limit);
    }
  };
}
function niceslice(str, len = 30) {
  return str.length >= len ? str.slice(0, len - 3) + "..." : str;
}

function center(text) {
  let lines = text.split("\n");
  let terminalColumns = process.stdout.columns;
  for (let i in lines) {
    lines[i] = lines[i]
      .padStart(Math.floor(terminalColumns / 2 + lines[i].length / 2), " ")
      .padEnd(terminalColumns, " ");
  }
  return lines.join("\n");
}
function sortBy(object, map, reverse = false) {
  let out = object.sort((a, b) => map(a) - map(b));
  if (reverse) {
    return out.reverse();
  }
  return out;
}
