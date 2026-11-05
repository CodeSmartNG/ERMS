import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/services/api';
import { enqueue, QUEUE_STATUS } from '@/services/offlineQueue';
import { flushQueue } from '@/services/syncService';

export default function SubmitResultPage() {
  const navigate = useNavigate();

  const [elections, setElections] = useState([]);
  const [parties, setParties] = useState([]);
  const [loading, setLoading] =
