//! TLS backend for IMAP connections.
//!
//! Desktop uses `native-tls` (OpenSSL / Schannel / SecureTransport, system
//! trust store). Mobile uses `rustls` with the bundled Mozilla root set from
//! `webpki-roots`, which avoids cross-compiling OpenSSL and Android's
//! OpenSSL-incompatible system CA store layout.

use tokio::net::TcpStream;

#[cfg(desktop)]
pub(crate) type TlsStream = tokio_native_tls::TlsStream<TcpStream>;

#[cfg(mobile)]
pub(crate) type TlsStream = tokio_rustls::client::TlsStream<TcpStream>;

pub(crate) struct TlsConnector {
    #[cfg(desktop)]
    inner: tokio_native_tls::TlsConnector,
    #[cfg(mobile)]
    inner: tokio_rustls::TlsConnector,
}

/// Build a TLS connector, optionally accepting invalid certificates
/// (for local mail bridges like ProtonMail Bridge with self-signed certs).
#[cfg(desktop)]
pub(crate) fn build_tls_connector(accept_invalid_certs: bool) -> Result<TlsConnector, String> {
    let mut builder = native_tls::TlsConnector::builder();
    if accept_invalid_certs {
        builder.danger_accept_invalid_certs(true);
        builder.danger_accept_invalid_hostnames(true);
    }
    let nc = builder
        .build()
        .map_err(|e| format!("Failed to create TLS connector: {e}"))?;
    Ok(TlsConnector {
        inner: tokio_native_tls::TlsConnector::from(nc),
    })
}

#[cfg(mobile)]
pub(crate) fn build_tls_connector(accept_invalid_certs: bool) -> Result<TlsConnector, String> {
    use std::sync::Arc;

    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let builder = rustls::ClientConfig::builder_with_provider(provider.clone())
        .with_safe_default_protocol_versions()
        .map_err(|e| format!("Failed to create TLS connector: {e}"))?;

    let config = if accept_invalid_certs {
        builder
            .dangerous()
            .with_custom_certificate_verifier(Arc::new(danger::NoVerifier(provider)))
            .with_no_client_auth()
    } else {
        let roots = rustls::RootCertStore::from_iter(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
        builder.with_root_certificates(roots).with_no_client_auth()
    };

    Ok(TlsConnector {
        inner: tokio_rustls::TlsConnector::from(Arc::new(config)),
    })
}

impl TlsConnector {
    pub(crate) async fn connect(&self, host: &str, tcp: TcpStream) -> Result<TlsStream, String> {
        #[cfg(desktop)]
        {
            self.inner.connect(host, tcp).await.map_err(|e| e.to_string())
        }
        #[cfg(mobile)]
        {
            let name = rustls::pki_types::ServerName::try_from(host.to_string())
                .map_err(|e| format!("invalid server name {host}: {e}"))?;
            self.inner.connect(name, tcp).await.map_err(|e| e.to_string())
        }
    }
}

#[cfg(mobile)]
mod danger {
    use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
    use rustls::crypto::{verify_tls12_signature, verify_tls13_signature, CryptoProvider};
    use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
    use rustls::{DigitallySignedStruct, Error, SignatureScheme};
    use std::sync::Arc;

    /// Accepts any server certificate. Only used when the user explicitly
    /// enabled "accept invalid certificates" for an account.
    #[derive(Debug)]
    pub(super) struct NoVerifier(pub(super) Arc<CryptoProvider>);

    impl ServerCertVerifier for NoVerifier {
        fn verify_server_cert(
            &self,
            _end_entity: &CertificateDer<'_>,
            _intermediates: &[CertificateDer<'_>],
            _server_name: &ServerName<'_>,
            _ocsp: &[u8],
            _now: UnixTime,
        ) -> Result<ServerCertVerified, Error> {
            Ok(ServerCertVerified::assertion())
        }

        fn verify_tls12_signature(
            &self,
            message: &[u8],
            cert: &CertificateDer<'_>,
            dss: &DigitallySignedStruct,
        ) -> Result<HandshakeSignatureValid, Error> {
            verify_tls12_signature(message, cert, dss, &self.0.signature_verification_algorithms)
        }

        fn verify_tls13_signature(
            &self,
            message: &[u8],
            cert: &CertificateDer<'_>,
            dss: &DigitallySignedStruct,
        ) -> Result<HandshakeSignatureValid, Error> {
            verify_tls13_signature(message, cert, dss, &self.0.signature_verification_algorithms)
        }

        fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
            self.0.signature_verification_algorithms.supported_schemes()
        }
    }
}
