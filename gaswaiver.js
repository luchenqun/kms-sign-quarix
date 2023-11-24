import { createTxMsgApplyNormalGasWaiver, createTxMsgApproveApplication, createTxMsgGrantNormalGasWaiver } from '@quarix/transactions'
import { createTxRaw, createBasicGasAllowance } from '@quarix/proto'
import { TypedDataUtils } from '@metamask/eth-sig-util'
import { App, CosmosTxV1Beta1BroadcastMode, generatePostBodyBroadcast } from '@quarix/provider'
import { ethToQuarix } from '@quarix/address-converter'
import { BigNumber } from 'ethers'
import { signTypedData } from '@metamask/eth-sig-util'
import { arrayify, concat, splitSignature } from '@ethersproject/bytes'
import { Wallet } from '@ethersproject/wallet'
import { Timestamp } from '@bufbuild/protobuf'
import * as dotenv from 'dotenv'
import KmsSigner from './kms-signer.js'

const privateKeyToPublicKey = (privateKey, base64Encode = true) => {
  const wallet = new Wallet(Buffer.from(privateKey.replace('0x', ''), 'hex'))
  const compressedPublicKey = wallet._signingKey().compressedPublicKey.toLowerCase().replace('0x', '')
  if (base64Encode) {
    return Buffer.from(compressedPublicKey, 'hex').toString('base64')
  }
  return compressedPublicKey
}

const privateKeyToQuarixAddress = (privateKey) => {
  const wallet = new Wallet(Buffer.from(privateKey.replace('0x', ''), 'hex'))
  return ethToQuarix(wallet.address)
}

const createTx = async (createTxMsg, context, params, kmsSignerOrPrivateKey, signType = 'kms') => {
  const msg = createTxMsg(context, params)
  const privateKeyBuf = signType !== 'kms' && Buffer.from(kmsSignerOrPrivateKey, 'hex')
  let signatureBytes
  if (signType === 'kms') {
    const digestBuf = TypedDataUtils.eip712Hash(msg.eipToSign, 'V4')
    const signature = await kmsSignerOrPrivateKey.signDigest(digestBuf.toString('hex'))
    signatureBytes = Buffer.from(signature.replace('0x', ''), 'hex')
  } else if (signType === 'eip712') {
    const signature = signTypedData({
      privateKey: privateKeyBuf,
      data: msg.eipToSign,
      version: 'V4',
    })
    signatureBytes = Buffer.from(signature.replace('0x', ''), 'hex')
  } else if (signType == '') {
    const wallet = new Wallet(privateKeyBuf)
    const dataToSign = `0x${Buffer.from(msg.signDirect.signBytes, 'base64').toString('hex')}`
    const signatureRaw = wallet._signingKey().signDigest(dataToSign)
    const splitedSignature = splitSignature(signatureRaw)
    signatureBytes = arrayify(concat([splitedSignature.r, splitedSignature.s]))
  } else {
    throw `unknow signType ${signType}`
  }

  const rawTx = createTxRaw(msg.signDirect.body.toBinary(), msg.signDirect.authInfo.toBinary(), [signatureBytes])
  const txBytes = JSON.parse(generatePostBodyBroadcast(rawTx)).tx_bytes
  const txHexBytes = '0x' + Buffer.from(txBytes).toString('hex')
  return [txHexBytes, Buffer.from(txBytes).toString('base64')]
}

;(async () => {
  try {
    dotenv.config()

    // UPDATE YOU KMS PARAMS IN .env FIlE
    const { KEY_ID, ACCESS_KEY_ID, SECRET_ACCESS_KEY, REGION, API_VERSION, PROVIDER } = process.env
    const kmsParams = {
      keyId: KEY_ID,
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
      region: REGION,
      apiVersion: API_VERSION,
    }
    const kmsSigner = new KmsSigner(kmsParams, PROVIDER)

    const chain = {
      chainId: 8888888,
      cosmosChainId: 'quarix_8888888-1',
    }
    const ethAddress = await kmsSigner.getAddress()
    const accountAddress = ethToQuarix(ethAddress)
    const publicKey = await kmsSigner.getCompressedPublicKey()
    const publicKeyBase64 = Buffer.from(publicKey.replace('0x', ''), 'hex').toString('base64')

    console.log('kms ethAddress', ethAddress)
    console.log('bech32 address', accountAddress)
    console.log('publicKey', publicKey)
    console.log('base64(publicKey)', publicKeyBase64)

    let sender = {
      accountAddress,
      sequence: undefined,
      accountNumber: undefined,
      pubkey: publicKeyBase64,
    }

    const gas = '1000000'
    let fee = {
      amount: undefined,
      denom: 'aqare',
      gas,
    }

    const memo = 'quarixjs test'

    // Update params based on the message you want to send
    let params = undefined

    const baseURL = 'http://127.0.0.1:1317'
    const app = new App({ baseURL })

    const account = await app.auth.account(sender.accountAddress)
    sender.sequence = account.account.base_account.sequence
    sender.accountNumber = account.account.base_account.account_number

    const { base_fee } = await app.feemarket.baseFee()
    const feemarketParams = await app.feemarket.params()
    const minGasPrice = feemarketParams.params.min_gas_price
    let gasPrice = BigNumber.from(base_fee || 0)
    // TODO: If the value of minGasPrice exceeds 2^53-1, there will be a overflow problem here
    const bigMinGasPrice = BigNumber.from(parseInt(parseFloat(minGasPrice) + 1))
    if (bigMinGasPrice.gt(gasPrice)) {
      gasPrice = bigMinGasPrice
    }
    fee.amount = gasPrice.mul(gas).toString()
    // console.log(base_fee, minGasPrice, gasPrice.toString(), fee.amount)

    const privateKey = 'YOU_PRIVATE_KEY' // the contract owner
    const contract = '0x546bc6E008689577C69C42b9C1f6b4C923f59B5d' // the contract address
    const scenario = '1'

    if (scenario == '1') {
      // scenario 1: non-owner ApplyNormalGasWaiver then owner ApproveApplication
      {
        // non-owner ApplyNormalGasWaiver
        params = {
          granter: sender.accountAddress,
          grantee: contract,
          allowance: createBasicGasAllowance('aqare', '5000000000000000000000000000000', Timestamp.fromDate(new Date('2024-01-01'))),
          period: 10000,
        }
        const context = { chain, sender, fee, memo }
        const [_, txBytesBase64] = await createTx(createTxMsgApplyNormalGasWaiver, context, params, kmsSigner, 'kms')
        const result = await app.tx.broadcastTx({ tx_bytes: txBytesBase64, mode: CosmosTxV1Beta1BroadcastMode.BROADCAST_MODE_BLOCK })
        console.log('============================ tx ApplyNormalGasWaiver result ============================ ')
        console.log(JSON.stringify(result, undefined, 2))
      }

      {
        // owner ApproveApplication
        sender = {
          accountAddress: privateKeyToQuarixAddress(privateKey),
          sequence: '0',
          accountNumber: '0',
          pubkey: privateKeyToPublicKey(privateKey),
        }
        const account = await app.auth.account(sender.accountAddress)
        sender.sequence = account.account.base_account.sequence
        sender.accountNumber = account.account.base_account.account_number
        params = {
          processor: sender.accountAddress,
          granter: accountAddress,
          grantee: contract,
        }
        const context = { chain, sender, fee, memo }
        const [_, txBytesBase64] = await createTx(createTxMsgApproveApplication, context, params, privateKey, 'eip712')
        const result = await app.tx.broadcastTx({ tx_bytes: txBytesBase64, mode: CosmosTxV1Beta1BroadcastMode.BROADCAST_MODE_BLOCK })
        console.log('============================ tx ApproveApplication result ============================ ')
        console.log(JSON.stringify(result, undefined, 2))
      }
    } else if (scenario == '2') {
      // scenario 2: owner GrantNormalGasWaiver
      sender = {
        accountAddress: privateKeyToQuarixAddress(privateKey),
        sequence: '0',
        accountNumber: '0',
        pubkey: privateKeyToPublicKey(privateKey),
      }

      const account = await app.auth.account(sender.accountAddress)
      sender.sequence = account.account.base_account.sequence
      sender.accountNumber = account.account.base_account.account_number

      params = {
        granter: sender.accountAddress,
        grantee: contract,
        allowance: createBasicGasAllowance('aqare', '5000000000000000000000000000000', Timestamp.fromDate(new Date('2024-01-01'))),
      }
      const context = { chain, sender, fee, memo }
      const [_, txBytesBase64] = await createTx(createTxMsgGrantNormalGasWaiver, context, params, privateKey, 'eip712')
      const result = await app.tx.broadcastTx({ tx_bytes: txBytesBase64, mode: CosmosTxV1Beta1BroadcastMode.BROADCAST_MODE_BLOCK })
      console.log('============================ tx GrantNormalGasWaiver result ============================ ')
      console.log(JSON.stringify(result, undefined, 2))
    }
  } catch (error) {
    console.log('error: ', error)
  }
})()
