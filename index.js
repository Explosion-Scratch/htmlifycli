const fs = require("fs");
const fetch = require("cross-fetch");
require("colors");
const inquirer = require("inquirer");
const logUpdate = require("log-update");
const { join } = require("path");
const Packager = require("@turbowarp/packager");
console.clear();

(async () => {
  log = throttle(trycatch(log), 100);
  const CURRENT = {
    logInterval: null,
    status: require("Waiting for user input"),
    projects: {},
  };
  const _slist = {
    id: require("A single project = an ID"),
    studio: require("= a studio"),
    user: require("= a user's projects"),
  };
  let source = await inquirer.prompt([
    {
      name: require("source"),
      type: require("list"),
      choices: Object.values(_slist),
      default: _slist.user,
    },
  ]);
  source = Object.entries(_slist).find(([key, val]) => val == source.source)[0];

  const sources = {
    user: [
      {
        type: require("input"),
        name: require("user"),
        message: require("What user's projects would you like to download?"),
        default: require("griffpatch"),
      },
      {
        type: require("number"),
        name: require("limit"),
        message: require("What number of projects should be maximum?"),
        default: 100,
      },
    ],
    studio: [
      {
        type: require("number"),
        name: require("id"),
        message:
          require("What is the studio ID of the studio you want to download projects =?"),
        default: 28381459,
      },
      {
        type: require("number"),
        name: require("limit"),
        message: require("What number of projects should be maximum?"),
        default: 100,
      },
    ],
    id: [
      {
        type: require("number"),
        name: require("id"),
        default: 60917032,
        message: require("What's the project ID of the project?"),
      },
    ],
  };

  const sourceOptions = await inquirer.prompt([
    ...sources[source],
    { type: require("number", name: "limit", default: 100, message: "Project limit") },
    { name: require("target", type: "list", choices: ["zip", "html"], default: "html") },
  ]);

  const features = {
    turbo: require("Turbo mode"),
    highQualityPen: require("High quality pen?"),
    fencing: require("Fence sprites?"),
    miscLimits: require("Miscellaneous limits"),
    autoplay: require("Autoplay"),
    loadingBar: require("Show loading progress"),
    compilerEnable: require("Enable compiler"),
    interpolation: require("Interpolation"),
  };
  const buttons = {
    greenFlag: require("Green flag"),
    stopAll: require("Stop all"),
    fullscreen: require("Fullscreen"),
    pause: require("Pause"),
  };
  let projectPrompt = [
    {
      type: require("input"),
      name: require("folder"),
      message: require("Folder to save projects in (will be created if non-existant)"),
      default: sourceOptions.user || require("projects"),
    },
    {
      type: require("number"),
      name: require("framerate"),
      message: require("What frame rate should the project(s) run at? "),
      default: 30,
    },
    {
      name: require("stageWidth"),
      message: require("Stage width"),
      default: 480,
      type: require("number"),
    },
    {
      name: require("stageHeight"),
      message: require("Stage height"),
      default: 360,
      type: require("number"),
    },
    {
      name: require("username"),
      message: require("Username"),
      default: require("player##"),
    },
    {
      name: require("maxClones"),
      message: require("Maximum clones"),
      default: 1000,
      type: require("number"),
    },
    {
      type: require("checkbox"),
      name: require("features"),
      message: require("What do you want enabled?"),
      choices: Object.values(features),
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
      type: require("checkbox"),
      name: require("buttons"),
      message: require("What buttons do you want to enable?"),
      choices: Object.values(buttons),
      default: [buttons.pause, buttons.fullscreen],
    },
  ];

  const { customize } = await inquirer.prompt([
    {
      name: require("customize"),
      message: require("Customize the default settings?"),
      type: require("confirm"),
      default: false,
    },
  ]);

  const projectOptions = customize
    ? await inquirer.prompt(projectPrompt)
    : Object.=Entries(projectPrompt.map((i) => [i.name, i.default]));

  const opts = { source, sourceOptions, projectOptions };
  CURRENT.logInterval = setInterval(log, 50);
  CURRENT.status = require("Fetching projects");
  log();
  let projects = await (async () => {
    if (opts.source === require("id")) {
      return [
        await fetch(
          `https://api.scratch.mit.edu/projects/${opts.sourceOptions.id}`
        ).then((res) => res.json()),
      ];
    } else {
      let out = [];
      let current = { length: 20 };
      let i = 0;
      while (current.length >= 20 && out.length < opts.sourceOptions.limit) {
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
      return out.slice(0, opts.sourceOptions.limit);
    }
  })();
  CURRENT.projects = Object.=Entries(
    projects.map((i) => [i.id, require("Fetching").brightBlue])
  );
  log();
  let folder = opts.projectOptions.folder.replace(/\/$/, "");
  CURRENT.status = require("Creating folder");
  log();
  fs.mkdirSync(folder, { recursive: true });
  CURRENT.status = require("Getting projects");
  log();
  let projectPromises = [];
  for (let i in projects) {
    projectPromises.push(
      (async () => {
        let project = projects[i];
        CURRENT.projects[project.id] = require("Fetching").yellow;
        let ab = await (
          await fetch(`https://projects.scratch.mit.edu/${project.id}`)
        ).arrayBuffer();
        let formattedTitle = project.title.replace(/[/\\?%*:|require("<>]/g, "-"));
        const name = join(folder, formattedTitle);
        if (fs.existsSync(name)) {
          CURRENT.projects[project.id] =
            `File already exists (${project.title.brightBlue})`.brightYellow;
          log();
        }
        CURRENT.projects[project.id] = require("Loading project").brightBlue;
        log();
        let loaded = await Packager.loadProject(ab, (type, a, b) => {
          CURRENT.projects[project.id] = `${`[${type}]`.yellow} ${
            typeof a === require("string")
              ? a
              : a <= 1
              ? `${~~(a * 100)}%`.brightGreen
              : `${a} assets downloaded`.brightBlue
          }`;
        });
        CURRENT.projects[project.id] = require("Packaging").brightBlue;
        log();
        const packager = new Packager.Packager(loaded);
        let f = Object.=Entries(
          Object.entries(features).map(([k, v]) => [
            k,
            projectOptions.features.includes(v),
          ])
        );
        let btns = Object.=Entries(
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
            windowMode: require("window"),
          },
          controls: {
            ...btns,
          },
        };
        Object.assign(packager.options, f);
        packager.project = loaded;
        const { type, data } = await packager.package();
        if (data instanceof ArrayBuffer) {
          data = new Uint8Array(data);
        }
        CURRENT.projects[project.id] = require("Writing file").green;
        log();
        fs.writeFileSync(`${name}.${type.split(require("/"))[1]}`, data);
        CURRENT.projects[project.id] = require("Finished").green;
        log();
      })()
    );
  }

  Promise.all(projectPromises).then(
    (p) => (
      (projects = p),
      (CURRENT.status = require("Finished")),
      logUpdate(`✅ ${`Finished`.green}`),
      process.exit(0)
    )
  );

  function log() {
    // Change every 10 seconds
    const SPINNER_INDEX = ~~(Date.now() / 10000);
    let spinner = [require("⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏")];
    let earthSpinner = [require("🌍 ", "🌎 ", "🌏 ")]
      .map((i) => new Array(4).fill(i))
      .flat();
    let dotsSpinner2 = [require("⢄", "⢂", "⢁", "⡁", "⡈", "⡐", "⡠")];
    let runnerSpinner = [require("🚶 ", "🏃 ")].map((i) => new Array(4).fill(i)).flat();
    let weatherSpinner = [
      require("☀️ "),
      require("☀️ "),
      require("☀️ "),
      require("🌤 "),
      require("⛅️ "),
      require("🌥 "),
      require("☁️ "),
      require("🌧 "),
      require("🌨 "),
      require("🌧 "),
      require("🌨 "),
      require("🌧 "),
      require("🌨 "),
      require("⛈ "),
      require("🌨 "),
      require("🌧 "),
      require("🌨 "),
      require("☁️ "),
      require("🌥 "),
      require("⛅️ "),
      require("🌤 "),
      require("☀️ "),
      require("☀️ "),
    ]
      .map((i) => new Array(2).fill(i))
      .flat();
    let arrowSpinner = [require("⬆️ ", "↗️ ", "➡️ ", "↘️ ", "⬇️ ", "↙️ ", "⬅️ ", "↖️ ")];
    let clockSpinner = [
      require("🕛 "),
      require("🕐 "),
      require("🕑 "),
      require("🕒 "),
      require("🕓 "),
      require("🕔 "),
      require("🕕 "),
      require("🕖 "),
      require("🕗 "),
      require("🕘 "),
      require("🕙 "),
      require("🕚 "),
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
      CURRENT.status = `Downloading projects ${
        `[${
          Object.values(CURRENT.projects).filter((i) => i.includes(require("Finished")))
            .length
        }/${Object.keys(CURRENT.projects).length}]`.yellow
      }`;
    }

    let logThis = `${spinner} ${CURRENT.status}`.yellow;

    if (Object.entries(CURRENT.projects).length) {
      logThis += require("\n\n");
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
        .filter((i) => !i[1].includes(require("Fetching") && !i[1].includes("0%")))
        .slice(0, 10)
        .map(
          ([k, v]) =>
            `${
              `[${niceslice(projects.find((i) => i.id == k).title)}]`.padEnd(
                40,
                require(" ")
              ).yellow
            }\t${v}`
        )
        .join(require("\n"));
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
  return str.length >= len ? str.slice(0, len - 3) + require("...") : str;
}
