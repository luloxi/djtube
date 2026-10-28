import { useEffect, useRef } from 'react';

export function WebcamTile({ onStatus }: { onStatus: (message: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancel = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((next) => {
        if (cancel) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = next;
        if (videoRef.current) videoRef.current.srcObject = next;
      })
      .catch(() => statusRef.current('Sin cámara'));
    return () => {
      cancel = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="webcam">
      <video ref={videoRef} autoPlay playsInline muted />
    </div>
  );
}
