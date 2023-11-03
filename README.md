## OverView

This project demonstrates how to sign an EIP712 type quarix transfer transaction using the AWS KMS service. Since theoretically all quarix transactions can be signed using EIP712, except for transfer transactions, other quarix transactions can also be signed using the KMS service.
Here is a brief explanation of the two implementation files:

* **kms-signer.js** mainly encapsulates the services provided by KMS. It implements functions such as retrieving the public key and address of KMS, and signing the message digest.
* **send.js** demonstrates how to send a transfer transaction using the KMS service.

The overall process is roughly as follows, the content inside the brackets represents the corresponding function call:

* Use the KMS service to obtain the corresponding address(kmsSigner.getAddress) and public key(kmsSigner.getCompressedPublicKey) as input for the message.
* Assemble a message, which contain an EIP712 type message(createTxMsg).
* Hash the EIP712 message to get the message digest(TypedDataUtils.eip712Hash).
* Use the KMS service to sign the message digest(kmsSigner.signDigest).
* Serialize the obtained signature and message into a string message(createTxRaw).
* Send the message to the blockchain(app.tx.broadcastTx).

这个项目演示如何使用AWS KMS服务签署一个EIP712类型的quarix转账交易。因为理论上quarix类型的交易均可以使用EIP712进行签名，所以除了转账交易之外，其他的quarix交易均可以使用KMS服务签名。
下面是两个实现文件的简要说明
* kms-signer.js 主要对KMS提供的服务进行进一步封装。实现了获取KMS的公钥，地址，对消息摘要进行签名等函数。
* send.js 演示了如何使用KMS服务发起一个转账交易的例子

整个流程大概如下所示，其中括号里面的内容表示对应的函数调用:
* 使用KMS服务获取对应的地址(kmsSigner.getAddress)，公钥(kmsSigner.getCompressedPublicKey)。作为消息的入参。
* 组装一个消息，该消息包行一个EIP712类型的消息(createTxMsgSend)
* 对EIP712消息进行哈希，得到消息摘要(TypedDataUtils.eip712Hash)
* 使用KMS服务对消息摘要进行签名(kmsSigner.signDigest)
* 将得到的签名与消息组序列化一个字符串消息(createTxRaw)
* 将消息发送到链上(app.tx.broadcastTx)

## Usage
* **npm i**
* Create a new **.env** file, update parameters based on .env.sample file example
* Execute **node send.js** to obtain the address (for example quarix1vdpuea6c9gd68nyx9434j0lm76993aagvk9ee2) and ensure that this address has an asset qare and qrx on the quarix chain. You can add assets to this address in the genesis block(recommended), or use other accounts to transfer some assets to him.
* Execute **node send.js** again to send the transaction

## Notice
The example given in the project https://github.com/krgko/hsm-kms-eth-signer-lab was written a long time ago. The npm package **aws-sdk** provided by AWS used in the project is no longer maintained. New npm package **@aws-sdk/client-kms** is provided. For the latest relevant documentation, see https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kms/

Since I did not read the KMS related documentation provided by AWS carefully, kms-signer.js may not be the best practice.

项目 https://github.com/krgko/hsm-kms-eth-signer-lab 给的例子由于是很久以前写的，项目中使用到的AWS提供的npm包aws-sdk不再维护，已经提供了新的npm包@aws-sdk/client-kms。相关最新文档见 https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kms/
由于我没有仔细阅读AWS提供的KMS相关文档，kms-signer.js也许不是最佳实践。