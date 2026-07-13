const fs = require("fs");
const path = require("path");

const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "pepurge.sol",
    "PEPURGE.json",
);
const outputPath = path.join(
    __dirname,
    "..",
    "..",
    "website",
    "src",
    "assets",
    "abis",
    "Pepurge.json",
);

const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(artifact.abi, null, 2)}\n`);
console.log("Wrote ABI:", outputPath);
