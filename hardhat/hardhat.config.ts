import fs from "fs";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";
import "hardhat-preprocessor";

function getSeaDropRemappings(): string[][] {
  if (!fs.existsSync("vendor/seadrop/remappings.txt")) {
    throw new Error(
      "Official SeaDrop source is missing. Run `npm run setup:seadrop` first.",
    );
  }

  return fs
    .readFileSync("vendor/seadrop/remappings.txt", "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [find, replace] = line.trim().split("=");
      return [find, `vendor/seadrop/${replace}`];
    });
}

function privateKeyFor(...names: string[]): string[] {
  for (const name of names) {
    const key = process.env[name];
    if (key && /^(0x)?[0-9a-fA-F]{64}$/.test(key)) {
      return [key.startsWith("0x") ? key : `0x${key}`];
    }
  }
  return [];
}

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.17",
        settings: {
          optimizer: { enabled: true, runs: 1 },
          metadata: { bytecodeHash: "none" },
        },
      },
      {
        version: "0.8.30",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
        },
      },
    ],
  },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    robinhood: {
      url:
        process.env.ROBINHOOD_RPC_URL ||
        "https://rpc.mainnet.chain.robinhood.com",
      accounts: privateKeyFor("ROBINHOOD_PRIVATE_KEY", "PRIVATE_KEY"),
      chainId: 4663,
    },
    robinhoodTestnet: {
      url:
        process.env.ROBINHOOD_TESTNET_RPC_URL ||
        "https://rpc.testnet.chain.robinhood.com",
      accounts: privateKeyFor(
        "ROBINHOOD_TESTNET_PRIVATE_KEY",
        "ROBINHOOD_PRIVATE_KEY",
        "PRIVATE_KEY",
      ),
      chainId: 46630,
    },
  },
  etherscan: {
    apiKey: {
      robinhood: "empty",
      robinhoodTestnet: "empty",
    },
    customChains: [
      {
        network: "robinhood",
        chainId: 4663,
        urls: {
          apiURL: "https://robinhoodchain.blockscout.com/api/",
          browserURL: "https://robinhoodchain.blockscout.com/",
        },
      },
      {
        network: "robinhoodTestnet",
        chainId: 46630,
        urls: {
          apiURL: "https://explorer.testnet.chain.robinhood.com/api/",
          browserURL: "https://explorer.testnet.chain.robinhood.com/",
        },
      },
    ],
  },
  preprocess: {
    eachLine: () => ({
      transform: (line: string) => {
        if (line.match(/ from "/i)) {
          for (const [find, replace] of getSeaDropRemappings()) {
            if (line.includes(find)) {
              return line.replace(find, replace);
            }
          }
        }
        return line;
      },
    }),
  },
};

export default config;
