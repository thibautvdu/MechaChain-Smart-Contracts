class ListenEvent {
    async generateJson(): Promise<void> {
        const ethers = require('ethers')
        const fs = require('fs')
        require("dotenv").config()
        const { ALCHEMY_KEY_MAINNET, ALCHEMY_KEY_RINKEBY, DEPLOY_BLOCK_ID } = process.env
    
        const myArgs = process.argv.slice(2)

        if (myArgs.length == 4) {
            const network: string = myArgs[0]
            const contractAddress: string = myArgs[1]
            const roundId: string = myArgs[2]
            const finaleMintPrice: string = myArgs[3]
            const finaleMintPriceGwei: number = ethers.utils.parseUnits(finaleMintPrice, "ether").toNumber()
    
            let provider
            if (network == "mainnet") {
                provider = new ethers.providers.WebSocketProvider(`wss://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_KEY_MAINNET}`)
            }
            else {
                provider = new ethers.providers.WebSocketProvider(`wss://eth-rinkeby.alchemyapi.io/v2/${ALCHEMY_KEY_RINKEBY}`)
            }
    
            const abi = [
                "event MintPaid(uint256 indexed roundId, address indexed wallet, uint256 amount, uint256 payement)"
            ]
    
            const contract = new ethers.Contract(contractAddress, abi, provider)
    
            //listen the new events
            /*contract.on("MintPaid", (roundId, wallet, amount, payement) => {
                console.log(BigNumber.toNumber(roundId));
                console.log(wallet);
                console.log(BigNumber.toNumber(amount));
                console.log(BigNumber.toNumber(payement));
            });*/
    
            let totalMinted = 0
            let totalWallet = 0
            let totalWalletPayement = 0
            let totalWalletToRefund = 0
            let totalPayementToRefund = 0
            let lastBlock = 0

            type Transaction = {
                txnHash: string;
                amount: number;
                payment: number;
            }
            type Wallet = {
                totalMinted: number;
                totalPayement: number;
                totalToRefund: number;
                txs: Transaction[];
                refunded: any;
            }
            let wallets: {[key: string]: Wallet} = {}
    
            //working code to get all the events from a given block number
            let eventFilter = contract.filters.MintPaid(roundId)
            let events = await contract.queryFilter(eventFilter, Number(DEPLOY_BLOCK_ID))
            events.forEach((event: any) => {
                const wallet: string = event.args['wallet']
                const amount: number = event.args['amount'].toNumber()
                const payement: number = event.args['payement'].toNumber()
                const txnHash: string = event.transactionHash
    
                totalMinted += amount
                totalWalletPayement += payement
                totalPayementToRefund += payement - (amount * finaleMintPriceGwei)
    
                if (wallet in wallets) {
                    wallets[wallet].totalMinted += amount
                    wallets[wallet].totalPayement += payement
                    wallets[wallet].totalToRefund += payement - (amount * finaleMintPriceGwei)
                }
                else {
                    wallets[wallet] = {
                        totalMinted: amount,
                        totalPayement: payement,
                        totalToRefund: payement - (amount * finaleMintPriceGwei),
                        txs: [],
                        refunded: null
                    }
                    totalWallet++
                }
                wallets[wallet].txs.push({
                    txnHash : txnHash,
                    amount : amount,
                    payment : payement
                })
    
                lastBlock = lastBlock > event.blockNumber ? lastBlock : event.blockNumber
            })
    
            Object.entries(wallets).forEach(function(entry) {
                if (entry[1].totalToRefund > 0) {
                    totalWalletToRefund++
                }
            })
    
            let jsonData: any = {
                'smartContract': contractAddress,
                'network': network,
                'finalPrice': finaleMintPriceGwei,
                'createdAt': Date.now(),
                'lastBlock': lastBlock,
                'totalMinted': totalMinted,
                'totalPayement': totalWalletPayement,
                'totalWallet': totalWallet,
                'totalWalletToRefund': totalWalletToRefund,
                'totalPayementToRefund': totalPayementToRefund,
                'totalWalletRefund': null,
                'totalRefund': null,
                'totalRefundFees': null,
                'wallets': wallets
            }
            let data = JSON.stringify(jsonData)
    
            try {
                fs.mkdirSync('./build', { recursive: true })
                fs.writeFileSync(`./build/refund_round_${roundId}_output.json`, data)
                process.exit(0)
            }
            catch(error) {
                console.log(error)
            }
        }
        else {
            console.log("Params are missing, please give : the network, the smart contract address, the roundId, and the final price of the mint;");
        }
    }
}

const listenEvent = new ListenEvent();
listenEvent.generateJson();

//script params : the network, the smart contract address, the roundId, and the final price of the mint
//npx ts-node .\scripts\listen_events.ts rinkeby 0x2B9017C07fB918158Df4e6A777ae4fEC861fED8e 1 0.0005
