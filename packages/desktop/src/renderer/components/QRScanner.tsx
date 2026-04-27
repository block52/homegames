import { Scanner, type IDetectedBarcode } from "@yudiel/react-qr-scanner";

interface Props {
    onDecoded: (text: string) => void;
    onError?: (err: unknown) => void;
}

export function QRScanner({ onDecoded, onError }: Props) {
    return (
        <div style={{ width: "100%", maxWidth: 360, margin: "0 auto" }}>
            <Scanner
                onScan={(codes: IDetectedBarcode[]) => {
                    const first = codes[0];
                    if (first?.rawValue) onDecoded(first.rawValue);
                }}
                onError={onError}
                formats={["qr_code"]}
                components={{ finder: false, audio: false, torch: false, zoom: false }}
                styles={{
                    container: { borderRadius: 8, overflow: "hidden" },
                    video: { borderRadius: 8 }
                }}
            />
        </div>
    );
}
