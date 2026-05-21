const { Firestore } = require('@google-cloud/firestore');

// Initializes the connection using your active project
const firestore = new Firestore({
  projectId: 'project-76d5128b-ead2-466c-b88',
  databaseId: '(default)',
});

async function verifyFirestoreConnection() {
  try {
    console.log('⏳ Attempting to connect and write to Firestore...');
    const testRef = firestore.collection('kidspeak_health_checks').doc('mvp-test');
    
    // 1. Test Write
    await testRef.set({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      app: 'KidSpeak MVP Test'
    });
    console.log('✅ Write successful!');
    
    // 2. Test Read
    const doc = await testRef.get();
    console.log('🔥 Firestore Connection Verified! Retrieved data:', doc.data());
  } catch (error) {
    console.error('❌ Firestore connection failed:', error);
  }
}

verifyFirestoreConnection();
