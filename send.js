import { createTxMsgSend } from "@quarix/transactions";
import { createTxRaw } from "@quarix/proto";
import { TypedDataUtils } from "@metamask/eth-sig-util";
import { App, CosmosTxV1Beta1BroadcastMode, generatePostBodyBroadcast } from "@quarix/provider";
import { ethToQuarix } from "@quarix/address-converter";
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
    // UPDATE YOU KMS PARAMS
    const kmsParams = {
      keyId: "YOU KEY ID",
      accessKeyId: "YOU ACCESS KEY ID",
      secretAccessKey: "",
      region: "",
      apiVersion: "latest",
    };
    const kmsSigner = new KmsSigner(kmsParams);

    const chain = {
      chainId: 8888888,
      cosmosChainId: "quarix_8888888-1",
    };
    const ethAddress = await kmsSigner.getAddress();
    const accountAddress = ethToQuarix(ethAddress);
    const publicKey = await kmsSigner.getCompressedPublicKey();

    console.log("kms ethAddress", ethAddress);
    console.log("bech32 address", accountAddress);

    let sender = {
      accountAddress,
      sequence: undefined,
      accountNumber: undefined,
      pubkey: Buffer.from(publicKey.replace("0x", ""), "hex").toString("base64"),
    };

    const fee = {
      amount: "4000000000000000000",
      denom: "aqare",
      gas: "2000000",
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