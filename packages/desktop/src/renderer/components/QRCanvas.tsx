import { useEffect, useRef } from "react";
import QRCode from "qrcode";

interface Props {
    payload: string;
    size?: number;
}

export function QRCanvas({ payload, size = 280 }: Props) {
    const ref = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        if (!ref.current) return;
        QRCode.toCanvas(ref.current, payload, {
            width: size,
            margin: 1,
            color: { dark: "#e6e8ec", light: "#0e0f12" },
            errorCorrectionLevel: "M"
        }).catch(() => { /* swallow */ });
    }, [payload, size]);

    return <canvas ref={ref} style={{ borderRadius: 6 }} />;
}
