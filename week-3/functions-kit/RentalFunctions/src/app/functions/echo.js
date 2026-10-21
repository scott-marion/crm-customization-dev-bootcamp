// Function 1: the handshake.
//
// This is the smallest useful serverless function. It takes whatever the card
// sent and hands it straight back, so you can see both halves of the contract:
//
//   card  ->  hubspot.serverless("echo", { parameters, propertiesToSend })
//   function  ->  return { statusCode, body }
//
// The uid in echo-hsmeta.json ("echo") is the name the card calls. Nothing
// else links them: not the file name, not the export name.

exports.main = async (context) => {
  const { portalId, user, parameters, propertiesToSend } = context;

  // console.log shows up in the terminal while `hs project dev` is running.
  console.log("echo called with parameters:", JSON.stringify(parameters));

  return {
    statusCode: 200,
    body: {
      receivedAt: new Date().toISOString(),
      portalId,
      // HubSpot sets `user` on the server from the signed-in user. The card
      // can't fake it, so it's safe to use for authorization. It is absent
      // during `hs project dev`.
      user: user ? { userId: user.userId, email: user.email, locale: user.locale } : null,
      parameters,
      propertiesToSend,
      nodeVersion: process.version,
    },
  };
};
