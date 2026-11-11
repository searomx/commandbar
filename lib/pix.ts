import { z } from "zod";

function field(id: string, value: string) {
  return `${id}${Buffer.byteLength(value).toString().padStart(2, "0")}${value}`;
}

export function crc16(value: string) {
  let crc = 0xffff;
  for (const byte of Buffer.from(value)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const text = (value: string, max: number) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 /.-]/g, "").slice(0, max);
const configSchema = z.object({
  key: z.string().min(1).max(77).refine((v) =>
    /^[0-9]{11}$/.test(v) || /^[0-9]{14}$/.test(v) ||
    /^\+[1-9]\d{9,14}$/.test(v) || z.email().safeParse(v).success ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)),
  name: z.string().min(1).transform((v) => text(v, 25)).refine(Boolean),
  city: z.string().min(1).transform((v) => text(v, 15)).refine(Boolean),
});

export function buildPix(config: { key?: string; name?: string; city?: string }, amount: string, orderId: number) {
  const validated = configSchema.safeParse(config);
  if (!validated.success) throw new Error("Pix indisponível. Configure chave, recebedor e cidade no servidor ou escolha outro meio.");
  if (!/^\d{1,8}\.\d{2}$/.test(amount) || Number(amount) <= 0) throw new Error("O valor do Pix deve ser maior que zero.");
  const { key, name, city } = validated.data;
  const payload = field("00", "01") + field("26", field("00", "br.gov.bcb.pix") + field("01", key)) +
    field("52", "0000") + field("53", "986") + field("54", amount) +
    field("58", "BR") + field("59", name) + field("60", city) +
    field("62", field("05", `CMD${orderId}`)) + "6304";
  return payload + crc16(payload);
}
