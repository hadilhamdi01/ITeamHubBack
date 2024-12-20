const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser'); 
const mongoose = require('mongoose');
const cors = require('cors');
const User = require('./models/User');
const Post = require('./models/Post'); 
const Community = require('./models/Community');
const multer = require('multer');


const communityRoutes = require('./routes/communityRoutes'); // Import the community routes
const postRoutes = require("./routes/postRoutes");
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const app = express();
const SECRET_KEY  = 'abcd1234';
const RESET_PASSWORD_SECRET = 'resetSecret1234';

// Connexion à MongoDB
mongoose.connect('mongodb://localhost:27017/iteam', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('Connexion à MongoDB réussie !'))
.catch((err) => console.error('Erreur de connexion à MongoDB :', err));

// Middleware
app.use(cors());
app.use(bodyParser.json());
// POST /register
// Route d'inscription
app.post('/register', async (req, res) => {
    const { email, password, role, pseudo, sexe, avatar, centresInteret } = req.body;
  
    if (!email || !password) {
      return res.status(400).json({ message: 'Email et mot de passe requis.' });
    }
  
    try {
      const hashedPassword = await bcrypt.hash(password, 10); // Cryptage du mot de passe
      const user = new User({ email, password: hashedPassword, role: ['user'],pseudo,
        sexe,
        avatar,
        centresInteret, });
      await user.save();
      res.status(201).json({ message: 'Utilisateur créé avec succès.' });
    } catch (err) {
      if (err.code === 11000) {
        res.status(400).json({ message: 'Email déjà utilisé.' });
      } else {
        res.status(500).json({ message: 'Erreur du serveur.' });
      }
    }
  });
  
 
app.get('/api/centres_interet', async (req, res) => { // Assure-toi que le chemin est correct ici
    try {
      const centresInteret = await CentreInteret.findAll();
      res.json(centresInteret);
    } catch (error) {
      res.status(500).json({ message: 'Erreur lors de la récupération des centres d\'intérêt' });
    }
  });

// Connexion
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Utilisez bcrypt.compare pour comparer le mot de passe haché
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Mot de passe incorrect' });
    }

    // Créer un token JWT
    const token = jwt.sign({ id: user._id }, SECRET_KEY, { expiresIn: '24h' });
    // Créer un token de rafraîchissement (JWT) avec expiration de 7 jours
     const refreshToken = jwt.sign({ id: user._id }, SECRET_KEY, { expiresIn: '7d' });

     // Sauvegarder le refreshToken dans la base de données pour l'utilisateur
     user.refreshToken = refreshToken;
     await user.save();
 
     res.json({ token, refreshToken });
  } catch (err) {
    console.error('Erreur lors de la connexion:', err);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});
// Route pour rafraîchir le token
app.post('/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ message: 'Token de rafraîchissement manquant' });
  }

  try {
    // Vérification du refresh token
    const decoded = jwt.verify(refreshToken, SECRET_KEY);

    // Chercher l'utilisateur par ID et vérifier que le refresh token correspond
    const user = await User.findById(decoded.id);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(403).json({ message: 'Token de rafraîchissement invalide' });
    }

    // Créer un nouveau token d'accès
    const token = jwt.sign({ id: user._id }, SECRET_KEY, { expiresIn: '24h' });

    res.json({ token });
  } catch (err) {
    console.error('Erreur lors du rafraîchissement du token:', err);
    res.status(403).json({ message: 'Token de rafraîchissement invalide ou expiré' });
  }
});



// Route pour récupérer les données de l'utilisateur connecté
app.get('/auth/me', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];  // Extraction du token depuis l'en-tête Authorization

  if (!token) {
    return res.status(401).json({ message: 'Token manquant' });  // Si le token n'est pas présent
  }

  // Vérification du token avec jwt.verify
  jwt.verify(token, SECRET_KEY, async (err, decoded) => {
    if (err) {
      console.error('Erreur JWT:', err);  // Affiche l'erreur dans la console pour le débogage
      return res.status(403).json({ message: 'Token invalide' });  // Si le token est invalide ou expiré
    }

    try {
      // Chercher l'utilisateur dans la base de données par son ID
      const user = await User.findById(decoded.id);

      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });  // Si l'utilisateur n'est pas trouvé
      }

      // Retourner les informations de l'utilisateur connecté
      res.json({
        id: user._id,
        email: user.email,
        pseudo: user.pseudo,
        sexe: user.sexe,
        avatar: user.avatar,
        role: user.role,
      });
    } catch (err) {
      console.error('Erreur lors de la recherche de l\'utilisateur:', err);
      res.status(500).json({ message: 'Erreur interne du serveur' });
    }
  });
});



  // Route pour réinitialiser le mot de passe
  app.post('/reset-password', async (req, res) => {
    const { email } = req.body;
  
    try {
      // Vérifiez si l'utilisateur existe dans la base de données
      const user = await User.findOne({ email });
  
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }
  
      // Générer un nouveau mot de passe (exemple simple)
      const newPassword = Math.random().toString(36).slice(-8);
  
      // Mettre à jour le mot de passe dans la base de données
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      user.password = hashedPassword;
      await user.save();
      // Configurer Nodemailer pour envoyer l'email
      const transporter = nodemailer.createTransport({
        service: 'gmail', // Vous pouvez utiliser un autre service SMTP
        auth: {
          user: 'hamdihadil51@gmail.com', // Votre adresse email
          pass: 'goqt ndvi vlja jaoz', // Mot de passe ou App Password (Gmail)
        },
      });
  
      // Contenu de l'email
      const mailOptions = {
        from: 'hamdihadil51@gmail.com', // Adresse de l'expéditeur
        to: email, // Adresse de destination
        subject: 'Réinitialisation de votre mot de passe',
        text: `Bonjour,\n\nVoici votre nouveau mot de passe : ${newPassword}\n\nMerci de vous connecter avec ce nouveau mot de passe et de le changer dès que possible.`,
      };
  
      // Envoyer l'email
      await transporter.sendMail(mailOptions);
  
      console.log(`Email envoyé à ${email} avec le mot de passe : ${newPassword}`);
      res.status(200).json({ message: 'Un email avec un nouveau mot de passe a été envoyé.' });
    } catch (error) {
      console.error('Erreur lors de la réinitialisation du mot de passe :', error);
      res.status(500).json({ message: 'Erreur interne du serveur' });
    }
  });
  //Modifier profil
  app.put('/update-profile', async (req, res) => {
    console.log("Requête reçue pour la mise à jour du profil");
  
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      console.log("En-tête Authorization manquant");
      return res.status(400).json({ message: 'En-tête Authorization manquant' });
    }
  
    const token = authHeader.split(' ')[1];
    if (!token) {
      console.log("Token manquant dans l'en-tête Authorization");
      return res.status(401).json({ message: 'Token manquant' });
    }
  
    jwt.verify(token, SECRET_KEY, async (err, decoded) => {
      if (err) {
        console.log("Erreur de vérification du token", err);
        // Si le token a expiré, vous pouvez envoyer un message pour que l'utilisateur rafraîchisse son token
        return res.status(403).json({ message: 'Token invalide ou expiré, veuillez utiliser le refresh token' });
      }
  
      try {
        console.log("Décodage du token réussi, ID utilisateur:", decoded.id);
        const user = await User.findById(decoded.id);
        if (!user) {
          console.log("Utilisateur non trouvé");
          return res.status(404).json({ message: 'Utilisateur non trouvé' });
        }
  
        const { pseudo, email, avatar } = req.body;
        console.log("Données reçues pour la mise à jour:", req.body);
  
        if (pseudo) user.pseudo = pseudo;
        if (email) user.email = email;
        if (avatar) user.avatar = avatar;
  
        await user.save();
        console.log("Utilisateur mis à jour:", user);
  
        res.json({
          message: 'Profil mis à jour avec succès',
          user: {
            id: user._id,
            email: user.email,
            pseudo: user.pseudo,
            avatar: user.avatar,
          },
        });
      } catch (err) {
        console.error("Erreur lors de la mise à jour de l'utilisateur:", err);
        res.status(500).json({ message: 'Erreur de serveur' });
      }
    });
  });
  
  // Route pour rechercher un utilisateur par pseudo
app.get('/users/search', async (req, res) => {
  const { pseudo } = req.query; // On récupère le pseudo à partir des paramètres de requête

  if (!pseudo) {
    return res.status(400).json({ message: 'Le pseudo est requis pour la recherche.' });
  }

  try {
    // Recherche de l'utilisateur dans la base de données
    const user = await User.findOne({ pseudo });

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    }

    // Retourner les informations de l'utilisateur trouvé
    res.json({
      id: user._id,
      email: user.email,
      pseudo: user.pseudo,
      sexe: user.sexe,
      avatar: user.avatar,
      role: user.role,
    });
  } catch (err) {
    console.error('Erreur lors de la recherche de l\'utilisateur:', err);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

//routes
app.use('/api', communityRoutes); 
app.use("/api", postRoutes);

// Lancer le serveur
app.listen(3000, () => {
    console.log('Serveur en écoute sur le port 3000');
});