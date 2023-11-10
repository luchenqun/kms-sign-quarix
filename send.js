import { createTxMsgSend } from "@quarix/transactions";
import { createTxRaw } from "@quarix/proto";
import { TypedDataUtils } from "@metamask/eth-sig-util";
import { App, CosmosTxV1Beta1BroadcastMode, generatePostBodyBroadcast } from "@quarix/provider";
import { ethToQuarix } from "@quarix/address-converter";
import { BigNumber } from "ethers";
import * as dotenv from "dotenv";
import KmsSigner from "./kms-signer.js";

const createTx = async (createTxMsg, context, params, kmsSigner, signType = "kms") => {
  const msg = createTxMsg(context, params);
  let signatureBytes;
  if (signType === "kms") {
    const digestBuf = TypedDataUtils.eip712Hash(msg.eipToSign, "V4");
    const signature = await kmsSigner.signDigest(digestBuf.toString("hex"));
    signatureBytes = Buffer.from(signature.replace("0x", ""), "hex");
  }

  const rawTx = createTxRaw(msg.signDirect.body.toBinary(), msg.signDirect.authInfo.toBinary(), [signatureBytes]);
  const txBytes = JSON.parse(generatePostBodyBroadcast(rawTx)).tx_bytes;
  const txHexBytes = "0x" + Buffer.from(txBytes).toString("hex");
  return [txHexBytes, Buffer.from(txBytes).toString("base64")];
};

(async () => {
  try {
    dotenv.config();

    // UPDATE YOU KMS PARAMS IN .env FIlE
    const { KEY_ID, ACCESS_KEY_ID, SECRET_ACCESS_KEY, REGION, API_VERSION, PROVIDER } = process.env;
    const kmsParams = {
      keyId: KEY_ID,
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
      region: REGION,
      apiVersion: API_VERSION,
    };
    const kmsSigner = new KmsSigner(kmsParams, PROVIDER);

    const chain = {
      chainId: 8888888,
      cosmosChainId: "quarix_8888888-1",
    };
    const ethAddress = await kmsSigner.getAddress();
    const accountAddress = ethToQuarix(ethAddress);
    const publicKey = await kmsSigner.getCompressedPublicKey();
    const publicKeyBase64 = Buffer.from(publicKey.replace("0x", ""), "hex").toString("base64");

    console.log("kms ethAddress", ethAddress);
    console.log("bech32 address", accountAddress);
    console.log("publicKey", publicKey);
    console.log("base64(publicKey)", publicKeyBase64);

    let sender = {
      accountAddress,
      sequence: undefined,
      accountNumber: undefined,
      pubkey: publicKeyBase64,
    };

    const gas = "1000000";
    let fee = {
      amount: undefined,
      denom: "aqare",
      gas,
    };

    const memo = "quarixjs test";

    // Update params based on the message you want to send
    const params = {
      destinationAddress: "quarix1hajh6rhhkjqkwet6wqld3lgx8ur4y3khmpfhlu",
      amount: "1",
      denom: "aqrx",
    };

    const baseURL = "http://127.0.0.1:1317";
    const app = new App({ baseURL });

    const account = await app.auth.account(sender.accountAddress);
    sender.sequence = account.account.base_account.sequence;
    sender.accountNumber = account.account.base_account.account_number;

    const { base_fee } = await app.feemarket.baseFee();
    fee.amount = BigNumber.from(gas).mul(BigNumber.from(base_fee || 0)).toString();

    {
      // use eip712 sign msg
      const context = { chain, sender, fee, memo };
      const [txHexBytes, txBytesBase64] = await createTx(createTxMsgSend, context, params, kmsSigner, "kms");
      const result = await app.tx.broadcastTx({ tx_bytes: txBytesBase64, mode: CosmosTxV1Beta1BroadcastMode.BROADCAST_MODE_BLOCK });
      console.log("============================ eip712 tx result ============================ ");
      console.log(JSON.stringify(result, undefined, 2));
    }
  } catch (error) {
    console.log("error: ", error);
  }
})();
