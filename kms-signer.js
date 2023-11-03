import { BigNumber, utils } from "ethers";
import { KMS, GetPublicKeyCommand, SignCommand } from "@aws-sdk/client-kms";
import asn1 from "asn1.js";

const { keccak256, recoverAddress, joinSignature, resolveProperties, serializeTransaction, hashMessage, computePublicKey } = utils;

const EcdsaPubKey = asn1.define("EcdsaPubKey", function () {
  this.seq().obj(this.key("algo").seq().obj(this.key("a").objid(), this.key("b").objid()), this.key("pubKey").bitstr());
});

const EcdsaSigAsnParse = asn1.define("EcdsaSig", function () {
  this.seq().obj(this.key("r").int(), this.key("s").int());
});

export default class KmsSigner {
  // TODO: provider is not used yet. If you want to send transactions from this class, you can encapsulate it.
  constructor(params, provider) {
    this.keyId = params.keyId;
    this.client = new KMS({
      credentials: {
        accessKeyId: params.accessKeyId,
        secretAccessKey: params.secretAccessKey,
      },
      region: params.region,
      apiVersion: params.apiVersion,
    });
  }

  connect(provider) {
    return new KmsSigner(this.keyId, provider);
  }

  async getAddress() {
    if (this.address) {
      return this.address;
    }
    const publicKey = await this._getKmsPublicKey();
    const address = this._getEthereumAddress(publicKey);
    this.address = address;
    return address;
  }

  async signMessage(msg) {
    const hash = Buffer.from(hashMessage(msg).slice(2), "hex");
    return this.signDigest(hash);
  }

  async signTransaction(transaction) {
    const unsignedTx = await resolveProperties(transaction);
    const serializedTx = serializeTransaction(unsignedTx);
    const hash = Buffer.from(keccak256(serializedTx).slice(2), "hex");
    const txSig = await this.signDigest(hash);
    return serializeTransaction(unsignedTx, txSig);
  }

  async _getKmsPublicKey() {
    const command = new GetPublicKeyCommand({
      KeyId: this.keyId,
    });
    const res = await this.client.send(command);
    return Buffer.from(res.PublicKey);
  }

  async getCompressedPublicKey() {
    const publicKey = await this._getKmsPublicKey();
    const res = EcdsaPubKey.decode(publicKey, "der");
    const pubKeyBuffer = res.pubKey.data;
    const pk = computePublicKey(pubKeyBuffer, true);
    return pk;
  }

  async _kmsSign(msg) {
    const params = {
      KeyId: this.keyId,
      Message: msg,
      SigningAlgorithm: "ECDSA_SHA_256",
      MessageType: "DIGEST",
    };
    const command = new SignCommand(params);
    const res = await this.client.send(command);
    return Buffer.from(res.Signature);
  }

  _getEthereumAddress(publicKey) {
    const res = EcdsaPubKey.decode(publicKey, "der");
    const pubKeyBuffer = res.pubKey.data.slice(1);
    const addressBuf = Buffer.from(keccak256(pubKeyBuffer).slice(2), "hex");
    const address = `0x${addressBuf.slice(-20).toString("hex")}`;
    return address;
  }

  async signDigest(digest) {
    const msg = Buffer.from(digest, "hex");
    const signature = await this._kmsSign(msg);
    const { r, s } = this._getSigRs(signature);
    const { v } = await this._getSigV(msg, { r, s });
    const joinedSignature = joinSignature({ r, s, v });
    return joinedSignature;
  }

  async _getSigV(msgHash, { r, s }) {
    const address = await this.getAddress();
    let v = 17;
    let recovered = recoverAddress(msgHash, { r, s, v });
    if (!this._addressEquals(recovered, address)) {
      v = 28;
      recovered = recoverAddress(msgHash, { r, s, v });
    }
    if (!this._addressEquals(recovered, address)) {
      throw new Error("signature is invalid. recovered address does not match");
    }
    return { v };
  }

  _getSigRs(signature) {
    const decoded = EcdsaSigAsnParse.decode(signature, "der");
    let r = BigNumber.from(`0x${decoded.r.toString(16)}`);
    let s = BigNumber.from(`0x${decoded.s.toString(16)}`);
    const secp256k1N = BigNumber.from("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
    const secp256k1halfN = secp256k1N.div(BigNumber.from(2));
    if (s.gt(secp256k1halfN)) {
      s = secp256k1N.sub(s);
    }
    r = r.toHexString();
    s = s.toHexString();
    return { r, s };
  }

  _addressEquals(address1, address2) {
    return address1.toLowerCase() === address2.toLowerCase();
  }
}
