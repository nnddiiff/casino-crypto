// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console } from "forge-std/Script.sol";
import { LimboCasino } from "../src/LimboCasino.sol";

/// @notice Деплой LimboCasino на Base Sepolia.
/// @dev Запуск:
///   forge script script/Deploy.s.sol:DeployScript \
///     --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify \
///     --etherscan-api-key $ETHERSCAN_API_KEY
/// Опциональное начальное пополнение банка/крана — через env BANK_SEED_WEI / FAUCET_SEED_WEI.
contract DeployScript is Script {
    // Pyth Entropy на Base Sepolia (зафиксировано в DECISIONS.md, сверено on-chain).
    address constant ENTROPY_BASE_SEPOLIA = 0x41c9e39574F40Ad34c79f1C99B66A45eFB830d4c;

    function run() external returns (LimboCasino casino) {
        address entropy = vm.envOr("ENTROPY_ADDRESS", ENTROPY_BASE_SEPOLIA);
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        uint256 bankSeed = vm.envOr("BANK_SEED_WEI", uint256(0));
        uint256 faucetSeed = vm.envOr("FAUCET_SEED_WEI", uint256(0));

        vm.startBroadcast(pk);
        casino = new LimboCasino(entropy, deployer);
        if (bankSeed > 0) casino.fundBank{ value: bankSeed }();
        if (faucetSeed > 0) casino.fundFaucet{ value: faucetSeed }();
        vm.stopBroadcast();

        console.log("LimboCasino deployed:", address(casino));
        console.log("owner / deployer:    ", deployer);
        console.log("entropy:             ", entropy);
        console.log("bank seed (wei):     ", bankSeed);
        console.log("faucet seed (wei):   ", faucetSeed);
    }
}
