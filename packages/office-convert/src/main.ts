import { createConverterServer } from "./server";

createConverterServer({
  report: (error) => process.stderr.write(`${String(error)}\n`),
}).listen(Number(process.env.PORT || 8080), "0.0.0.0");
