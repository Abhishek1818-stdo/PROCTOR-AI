import { useCallback, useEffect, useRef, useState } from "react";
import api from "./api";
import { getFaceDetector } from "./faceDetector";
import Exam from "./Exam";
import "./App.css";

const BRAND_NAME = "AssessIQ";
const TAGLINE = "Smarter Assessments. Trusted Results.";

function getErrorMessage(error) {
  const detail = error.response?.data?.detail;
  return typeof detail === "string"
    ? detail
    : "Unable to complete your request. Please try again.";
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");

  const [cameraStatus, setCameraStatus] = useState("Not checked");
  const [microphoneStatus, setMicrophoneStatus] = useState("Not checked");
  const [faceStatus, setFaceStatus] = useState("Not checked");
  const [deviceError, setDeviceError] = useState("");
  const [devicesChecked, setDevicesChecked] = useState(false);

  const [assessments, setAssessments] = useState([]);
  const [assessmentsLoading, setAssessmentsLoading] = useState(false);
  const [assessmentsError, setAssessmentsError] = useState("");

  const [pendingAssessment, setPendingAssessment] = useState(null);
  const [showInstructions, setShowInstructions] = useState(false);

  const [selectedAssessment, setSelectedAssessment] = useState(null);
  const [completedAttempt, setCompletedAttempt] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);

  const getAuthConfig = useCallback(() => {
    const token = sessionStorage.getItem("access_token");
    return {
      headers: { Authorization: `Bearer ${token}` },
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const token = sessionStorage.getItem("access_token");
      if (!token) return;

      try {
        const response = await api.get("/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!cancelled) setUser(response.data);
      } catch {
        sessionStorage.removeItem("access_token");
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    let cancelled = false;

    async function loadAssessments() {
      setAssessmentsLoading(true);
      setAssessmentsError("");

      try {
        const response = await api.get(
          "/assessments/",
          getAuthConfig()
        );

        if (!cancelled) {
          setAssessments(
            response.data.filter((assessment) => assessment.is_active)
          );
        }
      } catch (error) {
        if (!cancelled) {
          setAssessmentsError(getErrorMessage(error));
        }
      } finally {
        if (!cancelled) setAssessmentsLoading(false);
      }
    }

    loadAssessments();

    return () => {
      cancelled = true;
    };
  }, [user, getAuthConfig]);

  useEffect(() => {
    if (user || !streamRef.current) return;

    streamRef.current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    detectorRef.current = null;
  }, [user]);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthError("");
    setAuthMessage("");
    setAuthLoading(true);

    try {
      if (authMode === "register") {
        await api.post("/auth/register", {
          full_name: fullName.trim(),
          email: email.trim(),
          password,
        });

        setAuthMessage("Account created successfully. Please sign in.");
        setAuthMode("login");
        setPassword("");
        return;
      }

      const response = await api.post("/auth/login", {
        email: email.trim(),
        password,
      });

      const token = response.data.access_token;
      sessionStorage.setItem("access_token", token);

      try {
        const profileResponse = await api.get("/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });

        setUser(profileResponse.data);
        setPassword("");
      } catch (error) {
        sessionStorage.removeItem("access_token");
        throw error;
      }
    } catch (error) {
      setAuthError(getErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    sessionStorage.removeItem("access_token");

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    detectorRef.current = null;

    setUser(null);
    setPendingAssessment(null);
    setShowInstructions(false);
    setSelectedAssessment(null);
    setCompletedAttempt(null);
    setAssessments([]);
    setDevicesChecked(false);
    setCameraStatus("Not checked");
    setMicrophoneStatus("Not checked");
    setFaceStatus("Not checked");
    setDeviceError("");
    setAuthError("");
    setAuthMessage("");
  }

  async function checkDevices() {
    setDeviceError("");
    setDevicesChecked(false);
    setCameraStatus("Checking...");
    setMicrophoneStatus("Checking...");
    setFaceStatus("Not checked");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Camera and microphone access is unavailable. Please use localhost or HTTPS."
        );
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      streamRef.current = stream;

      const cameraTrack = stream.getVideoTracks()[0];
      const microphoneTrack = stream.getAudioTracks()[0];

      if (!cameraTrack || !microphoneTrack) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        throw new Error(
          "Both a camera and a microphone are required. Connect or enable both devices, then try again."
        );
      }

      if (
        cameraTrack.readyState !== "live" ||
        microphoneTrack.readyState !== "live"
      ) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        throw new Error(
          "Your camera or microphone is not working. Check your devices and try again."
        );
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      setCameraStatus("Ready");
      setMicrophoneStatus("Ready");

      const handleDeviceEnded = () => {
        setDevicesChecked(false);

        setCameraStatus(
          cameraTrack.readyState === "live" && cameraTrack.enabled
            ? "Ready"
            : "Unavailable"
        );

        setMicrophoneStatus(
          microphoneTrack.readyState === "live" && microphoneTrack.enabled
            ? "Ready"
            : "Unavailable"
        );

        setDeviceError(
          "Your camera or microphone was disconnected or stopped. Enable both devices and check again before starting."
        );
      };

      cameraTrack.addEventListener("ended", handleDeviceEnded);
      microphoneTrack.addEventListener("ended", handleDeviceEnded);

      try {
        detectorRef.current = await getFaceDetector();
        setFaceStatus("Ready");
      } catch (error) {
        console.error("Face detector initialization failed:", error);
        setFaceStatus("Unavailable");
      }

      setDevicesChecked(true);
      setDeviceError("");
    } catch (error) {
      console.error("Device check failed:", error);
      setDevicesChecked(false);
      setCameraStatus("Unavailable");
      setMicrophoneStatus("Unavailable");
      setFaceStatus("Not checked");

      setDeviceError(
        error.name === "NotAllowedError"
          ? "Camera and microphone permission was denied. Allow access in your browser settings, then click Enable Camera & Microphone."
          : error.name === "NotFoundError"
            ? "A camera or microphone could not be found. Connect both devices, then try again."
            : error.message ||
              "Unable to access your camera or microphone. Check your device connections and browser permissions."
      );
    }
  }

  function areMediaDevicesReady() {
    const stream = streamRef.current;
    if (!stream || !devicesChecked) return false;

    const cameraReady = stream.getVideoTracks().some(
      (track) => track.readyState === "live" && track.enabled
    );

    const microphoneReady = stream.getAudioTracks().some(
      (track) => track.readyState === "live" && track.enabled
    );

    return cameraReady && microphoneReady;
  }

  function openAssessment(assessment) {
    setCompletedAttempt(null);
    setPendingAssessment(assessment);
    setShowInstructions(false);
  }

  function closeAssessmentFlow() {
    setPendingAssessment(null);
    setShowInstructions(false);
  }

  function continueToInstructions() {
    if (!areMediaDevicesReady()) {
      setDeviceError(
        "Please enable your camera and microphone before continuing."
      );
      return;
    }

    setShowInstructions(true);
  }

  function beginAssessment() {
    if (!pendingAssessment) return;

    if (!areMediaDevicesReady()) {
      setDeviceError(
        "Your camera or microphone is no longer ready. Return to the dashboard, enable both devices, and check them again before starting."
      );
      setDevicesChecked(false);
      setShowInstructions(false);
      return;
    }

    setDeviceError("");
    setSelectedAssessment(pendingAssessment);
    setPendingAssessment(null);
    setShowInstructions(false);
    setCompletedAttempt(null);
  }

  function closeAssessment() {
    setSelectedAssessment(null);
    setCompletedAttempt(null);
  }

  if (user && selectedAssessment) {
    return (
      <Exam
        assessment={selectedAssessment}
        onExit={closeAssessment}
        onCompleted={(result) => setCompletedAttempt(result)}
      />
    );
  }

  if (user && String(user.role || "").toUpperCase() === "ADMIN") {
    return (
      <AdminDashboard
        user={user}
        onLogout={handleLogout}
        getAuthConfig={getAuthConfig}
      />
    );
  }

  if (!user) {
    return (
      <main className="assessiq-page">
        <nav className="assessiq-navbar">
          <a className="brand" href="/" aria-label="AssessIQ home">
            <span className="brand-icon">A</span>
            <span>{BRAND_NAME}</span>
          </a>

          <span className="navbar-caption">
            Online Assessment Platform
          </span>
        </nav>

        <section className="auth-layout">
          <div className="auth-intro">
            <span className="eyebrow">
              YOUR SKILLS. YOUR OPPORTUNITY.
            </span>

            <h1>
              Show what you know.
              <br />
              <span>Prove your potential.</span>
            </h1>

            <p>
              Take assessments in a secure, simple environment designed
              to help candidates demonstrate their skills with confidence.
            </p>

            <div className="feature-list">
              <div className="feature-item">
                <span className="feature-icon">✓</span>
                <div>
                  <strong>Simple assessments</strong>
                  <p>Access your assessments in one place.</p>
                </div>
              </div>

              <div className="feature-item">
                <span className="feature-icon">✓</span>
                <div>
                  <strong>Secure sign-in</strong>
                  <p>Your account is protected by authentication.</p>
                </div>
              </div>

              <div className="feature-item">
                <span className="feature-icon">✓</span>
                <div>
                  <strong>Device readiness</strong>
                  <p>
                    Check your camera and microphone before continuing.
                  </p>
                </div>
              </div>
            </div>

            <p className="intro-tagline">{TAGLINE}</p>
          </div>

          <div className="auth-panel">
            <div className="auth-panel-heading">
              <div className="mobile-brand">
                <span className="brand-icon">A</span>
                <span>{BRAND_NAME}</span>
              </div>

              <h2>
                {authMode === "login"
                  ? "Welcome back"
                  : "Create your account"}
              </h2>

              <p>
                {authMode === "login"
                  ? "Sign in to continue to your assessment."
                  : "Register to get started with AssessIQ."}
              </p>
            </div>

            <div className="auth-tabs">
              <button
                type="button"
                className={
                  authMode === "login" ? "auth-tab active" : "auth-tab"
                }
                onClick={() => {
                  setAuthMode("login");
                  setAuthError("");
                  setAuthMessage("");
                }}
              >
                Sign in
              </button>

              <button
                type="button"
                className={
                  authMode === "register" ? "auth-tab active" : "auth-tab"
                }
                onClick={() => {
                  setAuthMode("register");
                  setAuthError("");
                  setAuthMessage("");
                }}
              >
                Create account
              </button>
            </div>

            {authError && (
              <div className="auth-alert error" role="alert">
                {authError}
              </div>
            )}

            {authMessage && (
              <div className="auth-alert success" role="status">
                {authMessage}
              </div>
            )}

            <form className="auth-form" onSubmit={handleAuthSubmit}>
              {authMode === "register" && (
                <div className="form-field">
                  <label htmlFor="fullName">Full name</label>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    autoComplete="name"
                    placeholder="Enter your full name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                  />
                </div>
              )}

              <div className="form-field">
                <label htmlFor="email">Email address</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="password">Password</label>
                <input                  id="password"
                  name="password"
                  type="password"
                  autoComplete={
                    authMode === "login" ? "current-password" : "new-password"
                  }
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>

              <button
                className="primary-button auth-submit"
                type="submit"
                disabled={authLoading}
              >
                {authLoading
                  ? "Please wait..."
                  : authMode === "login"
                    ? "Sign in"
                    : "Create account"}
              </button>
            </form>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="assessiq-page dashboard-page">
      <nav className="assessiq-navbar dashboard-navbar">
        <a className="brand" href="/" aria-label="AssessIQ home">
          <span className="brand-icon">A</span>
          <span>{BRAND_NAME}</span>
        </a>

        <div className="navbar-user">
          <div className="navbar-user-details">
            <strong>
              {user.full_name || user.name || user.email}
            </strong>
            <span>Candidate</span>
          </div>

          <button
            type="button"
            className="secondary-button logout-button"
            onClick={handleLogout}
          >
            Sign out
          </button>
        </div>
      </nav>

      <section className="dashboard-content">
        <div className="dashboard-heading">
          <div>
            <span className="eyebrow">CANDIDATE PORTAL</span>
            <h1>Your assessments</h1>
            <p>
              Review your available assessments and check your devices
              before starting.
            </p>
          </div>

          <div className="dashboard-user-card">
            <span className="dashboard-avatar">
              {(user.full_name || user.name || user.email || "C")
                .charAt(0)
                .toUpperCase()}
            </span>

            <div>
              <strong>{user.full_name || user.name || "Candidate"}</strong>
              <span>{user.email}</span>
            </div>
          </div>
        </div>

        {assessmentsError && (
          <div className="auth-alert error" role="alert">
            {assessmentsError}
          </div>
        )}

        {completedAttempt && (
          <div className="completion-banner" role="status">
            <div>
              <strong>Assessment submitted</strong>
              <p>
                Your assessment has been submitted. You can continue
                reviewing the available assessments below.
              </p>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={() => setCompletedAttempt(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        <section className="device-check-card">
          <div className="device-check-heading">
            <div>
              <span className="eyebrow">BEFORE YOU BEGIN</span>
              <h2>Device readiness check</h2>
              <p>
                Enable your camera and microphone before entering an
                assessment.
              </p>
            </div>

            <span
              className={
                devicesChecked && areMediaDevicesReady()
                  ? "device-overall-status ready"
                  : "device-overall-status pending"
              }
            >
              {devicesChecked && areMediaDevicesReady()
                ? "Ready to continue"
                : "Check required"}
            </span>
          </div>

          {/* Updated layout: camera preview on the left, device details on the right. */}
          <div className="device-check-grid">
            <div className="camera-preview">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                aria-label="Candidate camera preview"
              />

              {cameraStatus !== "Ready" && (
                <div className="camera-preview-placeholder">
                  <span className="preview-camera-icon">◉</span>
                  <strong>Camera preview</strong>
                  <span>
                    Your camera feed will appear here after you enable it.
                  </span>
                </div>
              )}
            </div>

            <div className="device-check-details">
              <p className="device-instructions">
                Check that your camera and microphone are connected
                before entering the assessment.
              </p>

              <DeviceStatus label="Camera" status={cameraStatus} />
              <DeviceStatus label="Microphone" status={microphoneStatus} />
              <DeviceStatus label="Face detection" status={faceStatus} />

              <p className="device-help-text">
                Keep your camera and microphone connected throughout
                the assessment. If either device is unavailable, check
                your browser permissions and try again.
              </p>

              {deviceError && (
                <div className="auth-alert error" role="alert">
                  {deviceError}
                </div>
              )}

              <button
                type="button"
                className="primary-button"
                onClick={checkDevices}
              >
                {devicesChecked && areMediaDevicesReady()
                  ? "Check Devices Again"
                  : "Enable Camera & Microphone"}
              </button>
            </div>
          </div>
        </section>

        <section className="assessment-section">
          <div className="section-heading">
            <div>
              <h2>Available assessments</h2>
              <p>
                Choose an assessment to review its details and
                instructions.
              </p>
            </div>

            <span className="assessment-count">
              {assessments.length}{" "}
              {assessments.length === 1
                ? "assessment"
                : "assessments"}
            </span>
          </div>

          {assessmentsLoading ? (
            <div className="empty-state">
              <div className="loading-spinner" />
              <h3>Loading assessments</h3>
              <p>
                Please wait while we retrieve your assessments.
              </p>
            </div>
          ) : assessments.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">▤</div>
              <h3>No assessments available</h3>
              <p>
                There are currently no assessments to display.
                Please check back later.
              </p>
            </div>
          ) : (
            <div className="assessment-grid">
              {assessments.map((assessment) => (
                <article
                  className="assessment-card"
                  key={assessment.id}
                >
                  <div className="assessment-card-top">
                    <span className="assessment-card-icon">▤</span>
                    <span className="assessment-status-badge">
                      Available
                    </span>
                  </div>

                  <h3>{assessment.title}</h3>

                  <p className="assessment-description">
                    {assessment.description ||
                      "Complete this assessment to demonstrate your skills."}
                  </p>

                  <div className="assessment-meta">
                    <div>
                      <span className="meta-icon">◷</span>
                      <span>
                        {assessment.duration_minutes ??
                          assessment.duration ??
                          0}{" "}
                        minutes
                      </span>
                    </div>

                    {assessment.total_questions != null && (
                      <div>
                        <span className="meta-icon">☷</span>
                        <span>
                          {assessment.total_questions} questions
                        </span>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="primary-button assessment-start-button"
                    onClick={() => openAssessment(assessment)}
                  >
                    View & Start Assessment
                    <span aria-hidden="true">→</span>
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      {pendingAssessment && !showInstructions && (
        <div
          className="modal-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeAssessmentFlow();
            }
          }}
        >
          <section
            className="assessment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="assessment-confirm-title"
          >
            <button
              type="button"
              className="modal-close-button"
              aria-label="Close assessment details"
              onClick={closeAssessmentFlow}
            >
              ×
            </button>

            <div className="modal-icon">▤</div>
            <span className="eyebrow">ASSESSMENT OVERVIEW</span>

            <h2 id="assessment-confirm-title">
              {pendingAssessment.title}
            </h2>

            <p className="modal-description">
              {pendingAssessment.description ||
                "Review the details below before you begin."}
            </p>

            <div className="modal-info-grid">
              <div className="modal-info-item">
                <span>Duration</span>
                <strong>
                  {pendingAssessment.duration_minutes ??
                    pendingAssessment.duration ??
                    0}{" "}
                  minutes
                </strong>
              </div>

              {pendingAssessment.total_questions != null && (
                <div className="modal-info-item">
                  <span>Questions</span>
                  <strong>{pendingAssessment.total_questions}</strong>
                </div>
              )}
            </div>

            <div className="modal-notice">
              <strong>Before you continue</strong>
              <p>
                Make sure your camera and microphone are enabled and
                working. You will see the assessment instructions
                before entering the test.
              </p>
            </div>

            {!areMediaDevicesReady() && (
              <div className="auth-alert error" role="alert">
                Complete the camera and microphone check on the
                dashboard before continuing.
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeAssessmentFlow}
              >
                Cancel
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={continueToInstructions}
                disabled={!areMediaDevicesReady()}
              >
                Continue to instructions
              </button>
            </div>
          </section>
        </div>
      )}

      {pendingAssessment && showInstructions && (
        <div className="modal-overlay">
          <section
            className="assessment-modal instructions-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="assessment-instructions-title"
          >
            <button
              type="button"
              className="modal-close-button"
              aria-label="Close instructions"
              onClick={closeAssessmentFlow}
            >
              ×
            </button>

            <span className="eyebrow">PLEASE READ CAREFULLY</span>

            <h2 id="assessment-instructions-title">
              Assessment instructions
            </h2>

            <p>
              You are about to begin{" "}
              <strong>{pendingAssessment.title}</strong>. Please review
              these instructions before starting.
            </p>

            <ul className="instructions-list">
              <li>
                Find a quiet place and ensure your internet connection
                is stable.
              </li>
              <li>
                Keep your camera and microphone enabled during the
                assessment.
              </li>
              <li>
                Do not refresh or close the browser while the
                assessment is in progress.
              </li>
              <li>
                Manage your time carefully and submit your answers
                before the assessment ends.
              </li>
              <li>
                Follow the assessment rules and avoid switching away
                from the test unnecessarily.
              </li>
            </ul>

            <div className="modal-notice">
              <strong>Ready to start?</strong>
              <p>
                The assessment timer begins when you enter the test.
                Make sure you are ready before continuing.
              </p>
            </div>

            {!areMediaDevicesReady() && (
              <div className="auth-alert error" role="alert">
                Your camera or microphone is no longer ready. Return
                to the dashboard and check your devices again.
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowInstructions(false)}
              >
                Back
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={beginAssessment}
                disabled={!areMediaDevicesReady()}
              >
                Start assessment
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function DeviceStatus({ label, status }) {
  const ready = status === "Ready";
  const checking = status === "Checking...";

  return (
    <div className="device-status-row">
      <span>{label}</span>

      <span
        className={`device-status-pill ${
          ready ? "ready" : checking ? "checking" : "not-ready"
        }`}
      >
        <span className="status-dot" />
        {status}
      </span>
    </div>
  );
}function AdminDashboard({ user, onLogout, getAuthConfig }) {
  const [assessments, setAssessments] = useState([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState("");
  const [questions, setQuestions] = useState([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("60");
  const [totalMarks, setTotalMarks] = useState("10");

  const [questionText, setQuestionText] = useState("");
  const [optionA, setOptionA] = useState("");
  const [optionB, setOptionB] = useState("");
  const [optionC, setOptionC] = useState("");
  const [optionD, setOptionD] = useState("");
  const [correctAnswer, setCorrectAnswer] = useState("A");
  const [questionMarks, setQuestionMarks] = useState("1");

  const [loading, setLoading] = useState(false);
  const [assessmentsLoading, setAssessmentsLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [dashboardAttempts, setDashboardAttempts] = useState([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const selectedAssessment = assessments.find(
    (assessment) =>
      String(assessment.id) === String(selectedAssessmentId)
  );

  const loadAssessments = useCallback(async () => {
    setAssessmentsLoading(true);

    try {
      const response = await api.get("/assessments/", getAuthConfig());
      const items = Array.isArray(response.data) ? response.data : [];

      setAssessments(items);
      setError("");
      return items;
    } catch (err) {
      setError(getErrorMessage(err));
      return [];
    } finally {
      setAssessmentsLoading(false);
    }
  }, [getAuthConfig]);

  const loadQuestions = useCallback(
    async (assessmentId) => {
      if (!assessmentId) {
        setQuestions([]);
        return;
      }

      try {
        const response = await api.get(
          `/assessments/${assessmentId}/questions/`,
          getAuthConfig()
        );

        setQuestions(
          Array.isArray(response.data) ? response.data : []
        );
        setError("");
      } catch (err) {
        setQuestions([]);
        setError(getErrorMessage(err));
      }
    },
    [getAuthConfig]
  );

  useEffect(() => {
    loadAssessments();
  }, [loadAssessments]);

  useEffect(() => {
    loadQuestions(selectedAssessmentId);
  }, [selectedAssessmentId, loadQuestions]);

  const loadDashboardAttempts = useCallback(async () => {
    setDashboardLoading(true);
    setDashboardError("");

    try {
      const response = await api.get(
        "/admin/dashboard/attempts",
        getAuthConfig()
      );

      setDashboardAttempts(
        Array.isArray(response.data) ? response.data : []
      );
    } catch (err) {
      setDashboardError(getErrorMessage(err));
    } finally {
      setDashboardLoading(false);
    }
  }, [getAuthConfig]);

  useEffect(() => {
    loadDashboardAttempts();
  }, [loadDashboardAttempts]);
  
  const [selectedAttemptId, setSelectedAttemptId] = useState("");
  const [proctoringEvents, setProctoringEvents] = useState([]);
  const [proctoringLoading, setProctoringLoading] = useState(false);
  const [proctoringError, setProctoringError] = useState("");
  const [reviewingEventId, setReviewingEventId] = useState(null);
  const [reviewComment, setReviewComment] = useState("");
  const [proctoringMessage, setProctoringMessage] = useState("");
  
  const loadProctoringEvents = useCallback(async (attemptId) => {
    if (!attemptId) {
      setProctoringEvents([]);
      return;
    }

    setProctoringLoading(true);
    setProctoringError("");
    setProctoringMessage("");

    try {
      const response = await api.get(
        `/attempts/${attemptId}/proctoring-events/`,
        getAuthConfig()
      );

      setProctoringEvents(
        Array.isArray(response.data) ? response.data : []
      );
    } catch (err) {
      setProctoringError(getErrorMessage(err));
      setProctoringEvents([]);
    } finally {
      setProctoringLoading(false);
    }
  }, [getAuthConfig]);
  
  async function handleReviewProctoringEvent(eventId) {
    if (!selectedAttemptId) return;

    setReviewingEventId(eventId);
    setProctoringError("");
    setProctoringMessage("");

    try {
      await api.patch(
  `/attempts/${selectedAttemptId}/proctoring-events/${eventId}/review?review_status=REVIEWED`,
  {
    review_comment: reviewComment.trim() || "Reviewed by admin",
  },
  getAuthConfig()
);

      setProctoringMessage("Proctoring event reviewed successfully.");
      setReviewComment("");
      await loadProctoringEvents(selectedAttemptId);
    } catch (err) {
      setProctoringError(getErrorMessage(err));
    } finally {
      setReviewingEventId(null);
    }
  }



  const filteredDashboardAttempts = dashboardAttempts.filter((attempt) => {
    const search = candidateSearch.trim().toLowerCase();

    const matchesSearch =
      !search ||
      String(attempt.candidate_name || "").toLowerCase().includes(search) ||
      String(attempt.candidate_email || "").toLowerCase().includes(search) ||
      String(attempt.assessment_id || "").includes(search) ||
      String(attempt.attempt_id || "").includes(search);

    const matchesStatus =
      statusFilter === "ALL" ||
      String(attempt.status || "").toUpperCase() === statusFilter;

    return matchesSearch && matchesStatus;
  });

  async function handleCreateAssessment(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await api.post(
        "/assessments/",
        {
          title: title.trim(),
          description: description.trim(),
          duration_minutes: Number(duration),
          total_marks: Number(totalMarks),
        },
        getAuthConfig()
      );

      setMessage("Assessment created successfully.");
      setTitle("");
      setDescription("");
      setDuration("60");
      setTotalMarks("10");

      const updatedAssessments = await loadAssessments();
      const createdId = response.data?.id;

      if (createdId != null) {
        setSelectedAssessmentId(String(createdId));
      } else if (updatedAssessments.length > 0) {
        setSelectedAssessmentId(
          String(updatedAssessments[updatedAssessments.length - 1].id)
        );
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleAddQuestion(event) {
    event.preventDefault();

    if (!selectedAssessmentId) {
      setError("Please select an assessment first.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      await api.post(
        `/assessments/${selectedAssessmentId}/questions/`,
        {
          question_text: questionText.trim(),
          option_a: optionA.trim(),
          option_b: optionB.trim(),
          option_c: optionC.trim(),
          option_d: optionD.trim(),
          correct_answer: correctAnswer,
          marks: Number(questionMarks),
        },
        getAuthConfig()
      );

      setMessage("Question added successfully.");
      setQuestionText("");
      setOptionA("");
      setOptionB("");
      setOptionC("");
      setOptionD("");
      setCorrectAnswer("A");
      setQuestionMarks("1");

      await loadQuestions(selectedAssessmentId);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="assessiq-page dashboard-page">
      <nav className="assessiq-navbar">
        <a className="brand" href="/" aria-label="AssessIQ home">
          <span className="brand-icon">A</span>
          <span>{BRAND_NAME}</span>
        </a>

        <div className="nav-user">
          <div className="user-avatar">
            {(user.full_name || user.email || "A")
              .charAt(0)
              .toUpperCase()}
          </div>

          <div className="user-details">
            <strong>{user.full_name || user.email}</strong>
            <span>Administrator</span>
          </div>

          <button
            type="button"
            className="logout-button"
            onClick={onLogout}
          >
            Sign out
          </button>
        </div>
      </nav>

      <section className="dashboard-content">
        <div className="dashboard-heading">
          <span className="eyebrow">ASSESSIQ ADMINISTRATION</span>
          <h1>Admin Dashboard</h1>
          <p>
            Create assessments, add multiple-choice questions, and
            review your question bank.
          </p>
        </div>

        {error && (
          <div className="auth-alert error" role="alert">
            {error}
          </div>
        )}

        {message && (
          <div className="auth-alert success" role="status">
            {message}
          </div>
        )}

        <section className="dashboard-stats">
          <article className="dashboard-stat-card">
            <span className="stat-label">Total assessments</span>
            <strong>{assessments.length}</strong>
          </article>

          <article className="dashboard-stat-card">
            <span className="stat-label">
              Questions in selected assessment
            </span>
            <strong>{questions.length}</strong>
          </article>
        </section>

        <section className="admin-results-section">
          <div className="assessment-list-heading">
            <div>
              <span className="eyebrow">CANDIDATE ACTIVITY</span>
              <h2>Candidate Results</h2>
              <p>
                Review assessment attempts, scores, and proctoring risk.
              </p>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={loadDashboardAttempts}
              disabled={dashboardLoading}
            >
              {dashboardLoading ? "Refreshing..." : "Refresh results"}
            </button>
          </div>

          <div className="results-toolbar">
            <input
              type="search"
              aria-label="Search candidate results"
              placeholder="Search candidate, email, assessment ID, or attempt ID"
              value={candidateSearch}
              onChange={(event) => setCandidateSearch(event.target.value)}
            />

            <select
              aria-label="Filter results by status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="ALL">All statuses</option>
              <option value="STARTED">Started</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="COMPLETED">Completed</option>
              <option value="EXPIRED">Expired</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          {dashboardError && (
            <div className="auth-alert error" role="alert">
              {dashboardError}
            </div>
          )}

          {dashboardLoading && dashboardAttempts.length === 0 ? (
            <div className="assessment-empty">
              Loading candidate results...
            </div>
          ) : filteredDashboardAttempts.length === 0 ? (
            <div className="assessment-empty">
              {dashboardAttempts.length === 0
                ? "No candidate attempts found yet. Results will appear here after candidates start an assessment."
                : "No results match your search or status filter."}
            </div>
          ) : (
            <div className="results-table-wrapper">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Assessment</th>
                    <th>Status</th>
                    <th>Score</th>
                    <th>Proctoring risk</th>
                    <th>Started</th>
                    <th>Submitted</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredDashboardAttempts.map((attempt) => {
                    const status = String(
                      attempt.status || "UNKNOWN"
                    ).toUpperCase();

                    const riskLevel = String(
                      attempt.risk_level || "LOW"
                    ).toLowerCase();

                    const percentage = attempt.percentage;
                    const score = attempt.score;

                    const startedAt = attempt.started_at
                      ? new Date(attempt.started_at).toLocaleString()
                      : "—";

                    const submittedAt = attempt.submitted_at
                      ? new Date(attempt.submitted_at).toLocaleString()
                      : "—";

                    return (
                      <tr key={attempt.attempt_id}>
                        <td>
                          <strong>
                            {attempt.candidate_name || "Unknown candidate"}
                          </strong>

                          <span className="result-email">
                            {attempt.candidate_email || "No email available"}
                          </span>

                          <span className="result-email">
                            Attempt #{attempt.attempt_id}
                          </span>
                        </td>

                        <td>Assessment #{attempt.assessment_id}</td>

                        <td>
                          <span className="result-status">{status}</span>
                        </td>

                        <td>
                          {score == null ? "—" : score}
                          {percentage == null
                            ? ""
                            : ` (${Number(percentage).toFixed(1)}%)`}
                        </td>

                        <td>
                          <span className={`risk-label risk-${riskLevel}`}>
                            {(attempt.risk_level || "LOW").toString()} ·{" "}
                            {attempt.risk_score ?? 0}
                          </span>
                        </td>

                        <td>{startedAt}</td>
                        <td>{submittedAt}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="results-count">
            Showing {filteredDashboardAttempts.length} of{" "}
            {dashboardAttempts.length} attempt(s)
          </p>
        </section>
        
        <section className="admin-results-section">
          <div className="assessment-list-heading">
            <div>
              <span className="eyebrow">PROCTORING</span>
              <h2>Proctoring Event Review</h2>
              <p>Select a candidate attempt to inspect recorded events.</p>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={() => loadProctoringEvents(selectedAttemptId)}
              disabled={!selectedAttemptId || proctoringLoading}
            >
              {proctoringLoading ? "Loading..." : "Refresh events"}
            </button>
          </div>

          <div className="results-toolbar">
            <select
              aria-label="Select candidate attempt"
              value={selectedAttemptId}
              onChange={(event) => {
                const attemptId = event.target.value;
                setSelectedAttemptId(attemptId);
                setReviewComment("");
                loadProctoringEvents(attemptId);
              }}
            >
              <option value="">Select a candidate attempt</option>
              {dashboardAttempts.map((attempt) => (
                <option
                  key={attempt.attempt_id}
                  value={String(attempt.attempt_id)}
                >
                  Attempt #{attempt.attempt_id} —{" "}
                  {attempt.candidate_name || "Unknown candidate"}
                </option>
              ))}
            </select>
          </div>

          {proctoringError && (
            <div className="auth-alert error" role="alert">
              {proctoringError}
            </div>
          )}

          {proctoringMessage && (
            <div className="auth-alert success" role="status">
              {proctoringMessage}
            </div>
          )}

          {!selectedAttemptId ? (
            <div className="assessment-empty">
              Select an attempt above to view its proctoring events.
            </div>
          ) : proctoringLoading ? (
            <div className="assessment-empty">
              Loading proctoring events...
            </div>
          ) : proctoringEvents.length === 0 ? (
            <div className="assessment-empty">
              No proctoring events found for this attempt.
            </div>
          ) : (
            <div className="admin-question-list">
              {proctoringEvents.map((event) => (
                <article
                  className="admin-question-card"
                  key={event.id}
                >
                  <div className="admin-question-heading">
                    <strong>
                      {event.event_type || "Proctoring event"}
                    </strong>
                    <span>
                      {event.review_status || "PENDING"}
                    </span>
                  </div>

                  <p>
                    Event ID: {event.id} | Risk points:{" "}
                    {event.risk_points ?? 0}
                  </p>

                  <p>
                    {event.description ||
                      event.details ||
                      "No additional event details."}
                  </p>

                  {String(event.review_status || "PENDING").toUpperCase()
                    !== "REVIEWED" && (
                    <>
                      <label className="auth-field">
                        <span>Review comment</span>
                        <textarea
                          rows={2}
                          value={reviewComment}
                          onChange={(e) =>
                            setReviewComment(e.target.value)
                          }
                          placeholder="Enter your review comment"
                        />
                      </label>

                      <button
                        type="button"
                        className="primary-button"
                        onClick={() =>
                          handleReviewProctoringEvent(event.id)
                        }
                        disabled={reviewingEventId === event.id}
                      >
                        {reviewingEventId === event.id
                          ? "Reviewing..."
                          : "Mark as reviewed"}
                      </button>
                    </>
                  )}

                  {event.review_comment && (
                    <p>
                      <strong>Review comment:</strong>{" "}
                      {event.review_comment}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <div className="admin-dashboard-grid">
          <section className="admin-panel">
            <div className="card-heading">
              <div>
                <h2>Create assessment</h2>
                <p>Set the title, duration, and total marks.</p>
              </div>
            </div>

            <form className="auth-form" onSubmit={handleCreateAssessment}>
              <label className="auth-field">
                <span>Assessment title</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  minLength={3}
                  maxLength={200}
                  placeholder="e.g. Python Technical Assessment"
                  required
                />
              </label>

              <label className="auth-field">
                <span>Description</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  placeholder="Describe this assessment"
                  required
                />
              </label>

              <label className="auth-field">
                <span>Duration (minutes)</span>
                <input
                  type="number"
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                  min="1"
                  required
                />
              </label>

              <label className="auth-field">
                <span>Total marks</span>
                <input
                  type="number"
                  value={totalMarks}
                  onChange={(event) => setTotalMarks(event.target.value)}
                  min="1"
                  required
                />
              </label>

              <button
                type="submit"
                className="primary-button"
                disabled={loading}
              >
                {loading ? "Saving..." : "Create assessment"}
              </button>
            </form>
          </section>

          <section className="admin-panel">
            <div className="card-heading">
              <div>
                <h2>Add question</h2>
                <p>
                  Add a multiple-choice question to an assessment.
                </p>
              </div>
            </div>

            <form className="auth-form" onSubmit={handleAddQuestion}>
              <label className="auth-field">
                <span>Assessment</span>
                <select
                  value={selectedAssessmentId}
                  onChange={(event) =>
                    setSelectedAssessmentId(event.target.value)
                  }
                  required
                >
                  <option value="">Select an assessment</option>
                  {assessments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="auth-field">
                <span>Question</span>
                <textarea
                  value={questionText}
                  onChange={(event) => setQuestionText(event.target.value)}
                  minLength={5}
                  rows={3}
                  placeholder="Enter the question"
                  required
                />
              </label>

              <label className="auth-field">
                <span>Option A</span>
                <input
                  value={optionA}
                  onChange={(event) => setOptionA(event.target.value)}
                  maxLength={500}
                  required
                />
              </label>

              <label className="auth-field">
                <span>Option B</span>
                <input
                  value={optionB}
                  onChange={(event) => setOptionB(event.target.value)}
                  maxLength={500}
                  required
                />
              </label>

              <label className="auth-field">
                <span>Option C</span>
                <input
                  value={optionC}
                  onChange={(event) => setOptionC(event.target.value)}
                  maxLength={500}
                  required
                />
              </label>

              <label className="auth-field">
                <span>Option D</span>
                <input
                  value={optionD}
                  onChange={(event) => setOptionD(event.target.value)}
                  maxLength={500}
                  required
                />
              </label>

              <label className="auth-field">
                <span>Correct answer</span>
                <select
                  value={correctAnswer}
                  onChange={(event) => setCorrectAnswer(event.target.value)}
                  required
                >
                  <option value="A">Option A</option>
                  <option value="B">Option B</option>
                  <option value="C">Option C</option>
                  <option value="D">Option D</option>
                </select>
              </label>

              <label className="auth-field">
                <span>Marks for this question</span>
                <input
                  type="number"
                  value={questionMarks}
                  onChange={(event) => setQuestionMarks(event.target.value)}
                  min="1"
                  required
                />
              </label>

              <button
                type="submit"
                className="primary-button"
                disabled={loading || !selectedAssessmentId}
              >
                {loading ? "Saving..." : "Add question"}
              </button>
            </form>
          </section>
        </div>

        <section className="assessment-list-section">
          <div className="assessment-list-heading">
            <div>
              <span className="eyebrow">QUESTION BANK</span>
              <h2>Questions in this assessment</h2>
              <p>
                {selectedAssessment
                  ? selectedAssessment.title
                  : "Select an assessment to view its questions."}
              </p>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={() => loadQuestions(selectedAssessmentId)}
              disabled={!selectedAssessmentId}
            >
              Refresh questions
            </button>
          </div>

          {assessmentsLoading && (
            <div className="assessment-empty">
              Loading assessments...
            </div>
          )}

          {!assessmentsLoading && assessments.length === 0 && (
            <div className="assessment-empty">
              No assessments found. Create your first assessment above.
            </div>
          )}

          {selectedAssessmentId && questions.length === 0 && (
            <div className="assessment-empty">
              No questions found for this assessment yet.
            </div>
          )}

          {questions.length > 0 && (
            <div className="admin-question-list">
              {questions.map((question, index) => (
                <article
                  className="admin-question-card"
                  key={question.id ?? index}
                >
                  <div className="admin-question-heading">
                    <strong>
                      Question {index + 1}: {question.question_text}
                    </strong>
                    <span>{question.marks} mark(s)</span>
                  </div>

                  <div className="admin-options-grid">
                    <p>A. {question.option_a}</p>
                    <p>B. {question.option_b}</p>
                    <p>C. {question.option_c}</p>
                    <p>D. {question.option_d}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <p className="dashboard-tagline">{TAGLINE}</p>
      </section>
    </main>
  );
}