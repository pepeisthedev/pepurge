const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPOSITORY = "https://github.com/ProjectOpenSea/seadrop.git";
const PINNED_COMMIT = "6ab8b2ce1da7a750301fa34eb60a2bb8b26aebc1";
const destination = path.resolve("vendor/seadrop");

function git(args) {
    execFileSync("git", args, { stdio: "inherit" });
}

if (!fs.existsSync(path.join(destination, ".git"))) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    git(["clone", "--recurse-submodules", REPOSITORY, destination]);
}

git(["-C", destination, "fetch", "origin", PINNED_COMMIT]);
git(["-C", destination, "checkout", PINNED_COMMIT]);
git(["-C", destination, "submodule", "update", "--init", "--recursive"]);

console.log("Official SeaDrop source ready at:", destination);
console.log("Pinned commit:", PINNED_COMMIT);
